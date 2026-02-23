import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ClassifierService } from '../services/classifier.service';

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

function normalizeForGrouping(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9]/g, '') // remove numbers
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyword(texts: string[]): string {
  // Find the most common significant word/phrase across texts
  const wordCounts = new Map<string, number>();

  for (const text of texts) {
    const normalized = normalizeForGrouping(text);
    // Split into words and track word combinations
    const words = normalized.split(' ').filter((w) => w.length > 2);
    const seen = new Set<string>();

    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }

    // Also try 2-word combinations
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      if (!seen.has(bigram)) {
        seen.add(bigram);
        wordCounts.set(bigram, (wordCounts.get(bigram) || 0) + 1);
      }
    }
  }

  // Filter common/noise words
  const noise = new Set([
    'de', 'do', 'da', 'dos', 'das', 'para', 'por', 'com', 'sem',
    'que', 'uma', 'bra', 'pix', 'recebido', 'enviado', 'transf',
    'enviada', 'debito', 'cartao', 'credito',
  ]);

  // Return the word/phrase that appears most, preferring longer phrases
  let best = '';
  let bestScore = 0;
  for (const [word, count] of wordCounts) {
    if (noise.has(word)) continue;
    const score = count * (word.includes(' ') ? 2 : 1); // prefer bigrams
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
  ) {}

  async getSuggestions(): Promise<{
    suggestions: SuggestionGroup[];
    totalUnclassified: number;
  }> {
    // Get unclassified transactions
    const unclassified = await this.txRepo.find({
      where: [
        { categoria: 'Não classificado' as any },
        { categoria: null as any },
      ],
      order: { data: 'DESC' },
    });

    if (unclassified.length === 0) {
      return { suggestions: [], totalUnclassified: 0 };
    }

    // Group by normalized description pattern
    const groups = new Map<
      string,
      { transactions: Transaction[]; key: string }
    >();

    for (const tx of unclassified) {
      const key = normalizeForGrouping(tx.descricao || tx.titulo);
      if (!groups.has(key)) {
        groups.set(key, { transactions: [], key });
      }
      groups.get(key)!.transactions.push(tx);
    }

    // Convert to suggestion groups, sorted by count
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

    // Sort by count descending
    suggestions.sort((a, b) => b.count - a.count);

    return {
      suggestions: suggestions.slice(0, 20),
      totalUnclassified: unclassified.length,
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

    // Create the rule first
    // Find the highest priority and put new rule at the end
    const existingRules = await this.ruleRepo.find({
      order: { priority: 'ASC' },
    });
    const maxPriority =
      existingRules.length > 0
        ? Math.max(...existingRules.map((r) => r.priority))
        : 0;

    const rule = this.ruleRepo.create({
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
    const saved = await this.ruleRepo.save(rule);

    // Reclassify all
    const { totalChanged } = await this.classifierService.reclassifyAll();

    // Detect conflicts AFTER creating the rule (so it's in the DB)
    const { conflicts: rawConflicts } =
      await this.classifierService.detectConflicts(regex, saved.id);

    // Prepend the newly created rule to the conflicts list so the user
    // can reorder it relative to the existing conflicting rules
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
      transactionsClassified: totalChanged,
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

    // Reclassify after reorder
    await this.classifierService.reclassifyAll();
    return { updated };
  }
}
