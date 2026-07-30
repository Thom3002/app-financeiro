import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ClassifierService } from '../services/classifier.service';
import { CategoriesService } from '../categories/categories.service';

export interface SuggestionGroup {
  pattern: string;
  keyword: string;
  count: number;
  totalValue: number;
  examples: {
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
  }[];
}

function stripBankNoise(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Lista de prefixos e termos operacionais genéricos de bancos em qualquer posição do texto
  const noiseRegexes = [
    /\bdebito\s+de\s+cartao\b/gi,
    /\bdebito\s+cartao\b/gi,
    /\brever\s+par\s+deb\s+cartao\b/gi,
    /\bpix\s+enviado\s+para\b/gi,
    /\bpix\s+recebido\s+de\b/gi,
    /\btransf\s+enviada\s+pix\b/gi,
    /\btransf\s+recebida\s+pix\b/gi,
    /\btransf\s+enviada\b/gi,
    /\btransf\s+recebida\b/gi,
    /\btransferencia\s+enviada\b/gi,
    /\btransferencia\s+recebida\b/gi,
    /\bpagamento\s+de\s+boleto\b/gi,
    /\bpagto\s+elet\b/gi,
    /\bcompra\s+no\s+debito\b/gi,
    /\bcompra\s+no\s+credito\b/gi,
    /\bcompra\s+cartao\b/gi,
  ];

  for (const regex of noiseRegexes) {
    cleaned = cleaned.replace(regex, ' ').trim();
  }

  return cleaned.replace(/\s+/g, ' ');
}

function normalizeForGrouping(text: string): string {
  const cleaned = stripBankNoise(text || '');
  return cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9]/g, '') // remove numbers
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyword(texts: string[]): string {
  const wordCounts = new Map<string, number>();

  for (const text of texts) {
    const cleaned = stripBankNoise(text);
    const normalized = normalizeForGrouping(cleaned);
    const words = normalized.split(' ').filter((w) => w.length > 2);
    const seen = new Set<string>();

    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }

    // 2-word combinations
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      if (!seen.has(bigram)) {
        seen.add(bigram);
        wordCounts.set(bigram, (wordCounts.get(bigram) || 0) + 1);
      }
    }
  }

  const noise = new Set([
    'de', 'do', 'da', 'dos', 'das', 'para', 'por', 'com', 'sem',
    'que', 'uma', 'bra', 'pix', 'recebido', 'enviado', 'transf',
    'enviada', 'debito', 'cartao', 'credito', 'rever', 'par', 'deb',
    'sp', 'rj', 'mg', 'rs', 'pr', 'sc', 'ba', 'pe', 'ce', 'go', 'df',
    'pagamento', 'pagto', 'boleto', 'compra', 'transferencia',
  ]);

  let best = '';
  let bestScore = 0;
  for (const [word, count] of wordCounts) {
    // Ignora o termo se qualquer uma das palavras contidas nele for ruído
    if (word.split(' ').some((w) => noise.has(w))) continue;
    const score = count * (word.includes(' ') ? 2 : 1);
    if (score > bestScore || (score === bestScore && word.length > best.length)) {
      best = word;
      bestScore = score;
    }
  }

  return best;
}

@Injectable()
export class ClassificationService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
    private readonly classifierService: ClassifierService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async getSuggestions(): Promise<{
    suggestions: SuggestionGroup[];
    totalUnclassified: number;
  }> {
    // 1. Força a reclassificação de todas as transações com as regras mais recentes
    await this.classifierService.reclassifyAll();
    const activeRules = await this.classifierService.loadRules();

    // 2. Busca as transações sem categoria no banco
    const unclassified = await this.txRepo.find({
      where: [
        { categoria: 'Não classificado' as any },
        { categoria: null as any },
      ],
      order: { data: 'DESC' },
    });

    // 3. Exclui estritamente qualquer transação que já possua matched_rule_id ou corresponda a alguma regra ativa
    const trulyUnclassified = unclassified.filter((tx) => {
      if (tx.is_manual) return false;
      if (tx.matched_rule_id) return false;
      const res = this.classifierService.classifyTransaction(tx, activeRules);
      return !res.matched_rule_id && (res.categoria === 'Não classificado' || !res.categoria);
    });

    if (trulyUnclassified.length === 0) {
      return { suggestions: [], totalUnclassified: 0 };
    }

    const groups = new Map<
      string,
      { transactions: Transaction[]; key: string }
    >();

    for (const tx of trulyUnclassified) {
      // Prioriza encontrar o texto mais descritivo do estabelecimento/favorecido
      const fullText = [tx.titulo, tx.descricao].filter(Boolean).join(' ');
      const cleaned = stripBankNoise(fullText) || fullText;
      const key = normalizeForGrouping(cleaned);

      if (!key) continue;

      if (!groups.has(key)) {
        groups.set(key, { transactions: [], key });
      }
      groups.get(key)!.transactions.push(tx);
    }

    const suggestions: SuggestionGroup[] = [];

    for (const [, group] of groups) {
      if (group.transactions.length < 1) continue;

      const texts = group.transactions.map(
        (t) => (t.titulo || '') + ' ' + (t.descricao || ''),
      );
      const keyword = extractKeyword(texts);
      if (!keyword) continue;

      const totalValue = group.transactions.reduce(
        (sum, t) => sum + Math.abs(t.valor),
        0,
      );

      suggestions.push({
        pattern: group.key.substring(0, 60),
        keyword,
        count: group.transactions.length,
        totalValue: Math.round(totalValue * 100) / 100,
        examples: group.transactions.slice(0, 3).map((t) => ({
          data: t.data,
          titulo: t.titulo,
          descricao: t.descricao,
          valor: t.valor,
        })),
      });
    }

    suggestions.sort((a, b) => b.count - a.count);

    return {
      suggestions: suggestions.slice(0, 20),
      totalUnclassified: trulyUnclassified.length,
    };
  }

  async previewKeyword(
    keywords: string,
    campoAlvo: string = 'ambos',
  ): Promise<{
    matchCount: number;
    examples: { data: string; titulo: string; descricao: string; valor: number }[];
  }> {
    const regex = this.classifierService.keywordsToRegex(keywords);
    if (!regex) return { matchCount: 0, examples: [] };

    let re: RegExp;
    try {
      re = new RegExp(regex, 'i');
    } catch {
      return { matchCount: 0, examples: [] };
    }

    const allTxs = await this.txRepo.find();
    const matches: Transaction[] = [];

    for (const tx of allTxs) {
      let text = '';
      if (campoAlvo === 'titulo') text = tx.titulo || '';
      else if (campoAlvo === 'descricao') text = tx.descricao || '';
      else text = (tx.titulo || '') + ' ' + (tx.descricao || '');

      if (re.test(text.toLowerCase())) {
        matches.push(tx);
      }
    }

    return {
      matchCount: matches.length,
      examples: matches.slice(0, 5).map((t) => ({
        data: t.data,
        titulo: t.titulo,
        descricao: t.descricao,
        valor: t.valor,
      })),
    };
  }

  async apply(data: {
    keywords: string;
    categoria: string;
    subcategoria?: string;
    campo_alvo?: string;
  }): Promise<{
    ruleCreated: ClassificationRule;
    transactionsClassified: number;
    conflicts: any[];
  }> {
    const regex = this.classifierService.keywordsToRegex(data.keywords);

    // Verifica se já existem regras com o mesmo regex exato no banco
    const existingMatches = await this.ruleRepo.find({
      where: { regex },
      order: { priority: 'ASC' },
    });

    let rule: ClassificationRule;

    if (existingMatches.length > 0) {
      // Usa a primeira regra existente e atualiza seus dados
      const [first, ...duplicates] = existingMatches;
      rule = first;
      rule.categoria = data.categoria;
      rule.subcategoria = data.subcategoria || null;
      rule.campo_alvo = data.campo_alvo || 'ambos';
      rule.enabled = true;

      // Remove eventuais duplicadas anteriores que possam ter sido criadas antes
      for (const dup of duplicates) {
        await this.ruleRepo.remove(dup);
      }
    } else {
      // Caso não exista, cria uma nova regra na sequência de prioridades
      const existingRules = await this.ruleRepo.find({
        order: { priority: 'ASC' },
      });
      const maxPriority =
        existingRules.length > 0
          ? Math.max(...existingRules.map((r) => r.priority))
          : 0;

      rule = this.ruleRepo.create({
        regex,
        campo_alvo: data.campo_alvo || 'ambos',
        banco_escopo: 'qualquer',
        sinal_escopo: 'qualquer',
        categoria: data.categoria,
        subcategoria: data.subcategoria || null,
        priority: maxPriority + 10,
        enabled: true,
        overwrite_manual: false,
      });
    }

    const saved = await this.ruleRepo.save(rule);
    await this.categoriesService.ensureExists(data.categoria, data.subcategoria);

    const { totalChanged } = await this.classifierService.reclassifyAll();

    const matchingCount = await this.txRepo.count({
      where: { matched_rule_id: saved.id },
    });

    const { conflicts: rawConflicts } =
      await this.classifierService.detectConflicts(regex, saved.id);

    let conflicts: any[] = rawConflicts;
    if (rawConflicts.length > 0) {
      conflicts = [
        {
          rule: saved,
          overlapCount: rawConflicts[0].overlapCount,
          examples: rawConflicts[0].examples,
          isNew: true,
        },
        ...rawConflicts,
      ];
    }

    return {
      ruleCreated: saved,
      transactionsClassified: matchingCount || totalChanged,
      conflicts,
    };
  }

  async reorderPriorities(
    ruleIds: string[],
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (let i = 0; i < ruleIds.length; i++) {
      await this.ruleRepo.update(ruleIds[i], { priority: (i + 1) * 10 });
      updated++;
    }

    await this.classifierService.reclassifyAll();
    return { updated };
  }
}
