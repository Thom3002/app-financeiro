import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
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
    id?: string;
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
    banco?: string;
    tipo?: string;
  }[];
  allTransactions?: {
    id?: string;
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
    banco?: string;
    tipo?: string;
  }[];
}

/**
 * Extrai o nome do comerciante/pessoa de uma transação bancária brasileira.
 *
 * Estratégia em 3 camadas:
 *   1. Extração estrutural baseada no formato do título/descrição
 *   2. Normalização inteligente (remove sufixos corporativos, datas, locais)
 *   3. Agrupamento por nome normalizado com merge por prefixo comum
 */

// ── Camada 1: Extração Estrutural do Nome ───────────────────────────

/**
 * Extrai o "nome de entidade" (comerciante ou pessoa) do texto combinado
 * de título + descrição usando heurísticas específicas para formatos bancários BR.
 */
function extractMerchantName(titulo: string, descricao: string): string {
  const t = (titulo || '').trim();
  const d = (descricao || '').trim();

  // ─── Padrão PIX: nome da pessoa/empresa está no título ───
  const pixMatch = t.match(
    /^Pix\s+(?:enviado\s+para|recebido(?:\s+c6)?\s+de)\s+(.+)$/i,
  );
  if (pixMatch) {
    return cleanCorporateSuffixes(pixMatch[1].trim());
  }

  // ─── Padrão DEBITO/ESTORNO DE CARTÃO: nome está na descrição ───
  const isCardTx =
    /^(?:DEBITO\s+DE\s+CARTAO|EST\s+DEBITO\s+DE\s+CARTAO|REVER\s+PAR\s+DEB\s+CARTAO)\s*$/i.test(t);
  if (isCardTx && d) {
    return extractMerchantFromCardDescription(d);
  }

  // ─── Título genérico PIX no título, Descrição = "TRANSF ENVIADA PIX" ───
  const pixEnviadoMatch = t.match(
    /^Pix\s+enviado\s+para\s+(.+)$/i,
  );
  if (pixEnviadoMatch) {
    return cleanCorporateSuffixes(pixEnviadoMatch[1].trim());
  }

  // ─── Título = Descrição (ex: "PUC CONTA UNICA", "SUPERMED ADMIN...") ───
  const tNorm = t.toLowerCase().replace(/\s+/g, ' ').trim();
  const dNorm = d.toLowerCase().replace(/\s+/g, ' ').trim();
  if (tNorm === dNorm && tNorm.length > 0) {
    return cleanCorporateSuffixes(t);
  }

  // ─── Título significativo que não é um tipo de operação genérico ───
  const genericTitles = /^(DEBITO\s+DE\s+CARTAO|EST\s+DEBITO\s+DE\s+CARTAO|REVER\s+PAR\s+DEB\s+CARTAO|RECEBIMENTO\s+SALARIO|PGTO\s+FAT\s+CARTAO|CDB\s+C6|RES\s+DE\s+CDB|EMISSAO\s+DE\s+CDB|APLICAÇÃO\s+DE\s+CDB|RESGATE\s+DE\s+CDB|BANCO\s+C6|RENDIMENTOS|COD\.\s+LANC\.)$/i;
  if (t && !genericTitles.test(t.trim())) {
    // Se o título tem informação significativa (ex: "SUPERMED ADMINISTRADORA DE BENE")
    return cleanCorporateSuffixes(t);
  }

  // ─── Fallback: usa descrição se existir ───
  if (d && d.length > 3) {
    return cleanCorporateSuffixes(d);
  }

  return '';
}

/**
 * Extrai nome do comerciante de uma descrição de débito de cartão.
 * Formato típico: "NomeLoja       CIDADE        BRA"
 *
 * A lógica remove em ordem:
 *   1. Código de país (BRA, USA, etc.)
 *   2. Datas/horários embutidos (01Fev 12h44min)
 *   3. Cidade brasileira (RIO DE JANEIR, SAO PAULO, SP, etc.)
 *   4. Prefixos de processadoras (IFD*)
 *   5. Sufixos de plataforma (Uber *TRIP HELP.U, etc.)
 *   6. Sufixos corporativos (LTDA, S.A.)
 */
function extractMerchantFromCardDescription(desc: string): string {
  let cleaned = desc;

  // 1. Remove código de país no final (BRA, USA, etc.)
  cleaned = cleaned.replace(/\s+[A-Z]{2,3}$/, '');

  // 2. Remove datas/horários embutidos ANTES de remover cidade
  //    Padrão: "01Fev 12h44min", "24Jun 17h29min"
  cleaned = cleaned.replace(
    /\s+\d{1,2}(?:Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\s+\d{1,2}h\d{1,2}min/gi,
    '',
  );

  // 3. Remove cidades e estados brasileiros do final
  //    Suporta tanto \s{2,} (espaços grandes) quanto \s{1} (colado ao nome)
  const cityPattern = /\s+(RIO\s+DE\s+JANEIR\w*|SAO\s+PAULO|CURITIBA|BELO\s+HORIZ\w*|BRASILIA|SALVADOR|PORTO\s+ALEGR\w*|RECIFE|FORTALEZ\w*|MANAUS|CAMPINAS|DUQUE\s+DE\s+CAXI\w*|NITEROI|OSASCO|GUARULHO\w*)\s*$/i;
  cleaned = cleaned.replace(cityPattern, '');

  // Remove sigla de estado isolada no final (SP, RJ, MG, RS, PR, etc.)
  // Usa \s+ (1+ espaços) pois após remover datas, pode sobrar "99* POP SP"
  cleaned = cleaned.replace(/\s+(SP|RJ|MG|RS|PR|SC|BA|CE|PE|GO|DF|ES|PA|MA|MT|MS|PI|RN|PB|AL|SE|AM|RO|TO|AC|AP|RR)\s*$/i, '');

  // Fallback: 4+ espaços seguidos de texto curto = provavelmente cidade
  cleaned = cleaned.replace(/\s{4,}[A-Z\s]{3,20}\s*$/, '');

  cleaned = cleaned.trim();

  // 4. Remove prefixos de processadoras (IFD*, mas preserva 99*, DL*)
  cleaned = cleaned.replace(/^IFD\*\s*/i, '');

  // 5. Normaliza marcas de plataforma conhecidas
  //    Uber: "Uber UBER *TRIP HELP.U" | "Uber UBER *ONE MEMBERS" | "Uber UBER * PENDING" → "Uber"
  cleaned = cleaned.replace(
    /^(Uber)\s+UBER\s*\*.*$/i,
    '$1',
  );

  // 6. Limpa espaços múltiplos
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleanCorporateSuffixes(cleaned);
}

// ── Camada 2: Normalização Inteligente ──────────────────────────────

/**
 * Remove sufixos corporativos comuns de nomes brasileiros.
 */
function cleanCorporateSuffixes(name: string): string {
  return name
    .replace(
      /\s+(?:LTDA\.?|S\.?A\.?|S\/A|ME|EIRELI|EPP|INST(?:ITUICAO)?\.?\s+DE\s+PAGAMENTO\s*(?:LTDA\.?)?|MEIOS\s+DE\s+PAGAMENTOS?\s*(?:LTDA\.?)?)\s*\.?\s*$/i,
      '',
    )
    .replace(/\.\s*$/, '')
    .trim();
}

/**
 * Normaliza um nome de comerciante para fins de agrupamento:
 * lowercase, sem acentos, sem pontuação irrelevante.
 */
function normalizeMerchantKey(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9*\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Camada 3: Agrupamento com Merge por Prefixo Comum ──────────────

/**
 * Calcula o prefixo mais longo em comum entre duas strings
 * dividido por palavras (word-level LCP).
 */
function wordLevelLCP(a: string, b: string): string {
  const wa = a.split(' ');
  const wb = b.split(' ');
  const len = Math.min(wa.length, wb.length);
  const common: string[] = [];
  for (let i = 0; i < len; i++) {
    if (wa[i] === wb[i]) common.push(wa[i]);
    else break;
  }
  return common.join(' ');
}

/**
 * Dadas várias chaves normalizadas, tenta fazer merge de grupos
 * cujos nomes diferem apenas por uma preposição ("de", "da", "do")
 * no meio. Ex: "thomas mello oliva" + "thomas de mello oliva" → merge.
 */
function mergeGroups(
  groups: Map<string, { displayName: string; txIds: Set<string> }>,
): Map<string, { displayName: string; txIds: Set<string> }> {
  const PREPOSITIONS = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

  /** Remove preposições de uma chave para comparação mais flexível */
  const stripPrepositions = (key: string): string =>
    key.split(' ').filter(w => !PREPOSITIONS.has(w)).join(' ');

  const keys = Array.from(groups.keys()).sort((a, b) => {
    const ga = groups.get(a)!;
    const gb = groups.get(b)!;
    return gb.txIds.size - ga.txIds.size;
  });

  const merged = new Map<string, { displayName: string; txIds: Set<string> }>();
  const consumed = new Set<string>();

  for (const key of keys) {
    if (consumed.has(key)) continue;
    const group = groups.get(key)!;
    const currentTxIds = new Set(group.txIds);
    let bestDisplayName = group.displayName;

    const keyStripped = stripPrepositions(key);

    // Tenta encontrar outros grupos que possam ser mergiados
    for (const otherKey of keys) {
      if (otherKey === key || consumed.has(otherKey)) continue;

      const otherGroup = groups.get(otherKey)!;

      // Critério 1: LCP direto (palavra por palavra)
      const lcp = wordLevelLCP(key, otherKey);
      const lcpWords = lcp.split(' ').filter(w => w.length > 0);
      const significantWords = lcpWords.filter(
        w => !PREPOSITIONS.has(w) && w.length >= 2,
      );

      let shouldMerge = false;

      if (significantWords.length >= 2) {
        const otherWords = otherKey.split(' ').filter(w => w.length > 0);
        const keyWords = key.split(' ').filter(w => w.length > 0);
        const coverage = lcpWords.length / Math.min(keyWords.length, otherWords.length);
        if (coverage >= 0.6) shouldMerge = true;
      }

      // Critério 2: Comparação sem preposições
      // "thomas mello oliva" e "thomas de mello oliva" ficam iguais
      if (!shouldMerge) {
        const otherStripped = stripPrepositions(otherKey);
        if (keyStripped === otherStripped && keyStripped.split(' ').length >= 2) {
          shouldMerge = true;
        }
      }

      if (shouldMerge) {
        for (const id of otherGroup.txIds) {
          currentTxIds.add(id);
        }
        if (otherGroup.displayName.length > bestDisplayName.length) {
          bestDisplayName = otherGroup.displayName;
        }
        consumed.add(otherKey);
      }
    }

    consumed.add(key);
    merged.set(key, { displayName: bestDisplayName, txIds: currentTxIds });
  }

  return merged;
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

  async getSuggestions(
    dataInicio?: string,
    dataFim?: string,
  ): Promise<{
    suggestions: SuggestionGroup[];
    totalUnclassified: number;
  }> {
    const qb = this.txRepo.createQueryBuilder('tx');
    qb.where("(tx.categoria IS NULL OR tx.categoria = '' OR tx.categoria = 'Não classificado')");
    if (dataInicio) {
      qb.andWhere('tx.data >= :dataInicio', { dataInicio });
    }
    if (dataFim) {
      qb.andWhere('tx.data <= :dataFim', { dataFim });
    }
    const trulyUnclassified = await qb.getMany();

    // 1. Extrai nome do comerciante para cada transação
    const txById = new Map<string, Transaction>();
    const rawGroups = new Map<string, { displayName: string; txIds: Set<string> }>();

    for (const tx of trulyUnclassified) {
      const merchantName = extractMerchantName(tx.titulo, tx.descricao);
      if (!merchantName || merchantName.length < 2) continue;

      txById.set(tx.id, tx);
      const key = normalizeMerchantKey(merchantName);
      if (!key) continue;

      if (!rawGroups.has(key)) {
        rawGroups.set(key, { displayName: merchantName, txIds: new Set() });
      }
      const group = rawGroups.get(key)!;
      group.txIds.add(tx.id);
      // Mantém o displayName mais frequente (com mais caracteres, geralmente mais completo)
      if (merchantName.length > group.displayName.length) {
        group.displayName = merchantName;
      }
    }

    // 2. Merge grupos com nomes similares (variações com/sem preposição)
    const mergedGroups = mergeGroups(rawGroups);

    // 3. Filtra grupos com >= 2 transações e ordena por contagem desc
    const sortedGroups = Array.from(mergedGroups.values())
      .filter(g => g.txIds.size >= 2)
      .sort((a, b) => b.txIds.size - a.txIds.size);

    // 4. Monta sugestões finais (sem sobreposição — cada tx pertence ao primeiro grupo)
    const allocatedTxIds = new Set<string>();
    const suggestions: SuggestionGroup[] = [];

    for (const group of sortedGroups) {
      const availableIds = Array.from(group.txIds).filter(id => !allocatedTxIds.has(id));
      if (availableIds.length < 2) continue;

      const matchedTxs = availableIds.map(id => txById.get(id)!).filter(Boolean);
      for (const id of availableIds) {
        allocatedTxIds.add(id);
      }

      const totalValue = matchedTxs.reduce((sum, t) => sum + Math.abs(t.valor), 0);

      suggestions.push({
        pattern: group.displayName,
        keyword: group.displayName,
        count: matchedTxs.length,
        totalValue: Math.round(totalValue * 100) / 100,
        examples: matchedTxs.slice(0, 3).map((t) => ({
          id: t.id,
          data: t.data,
          titulo: t.titulo,
          descricao: t.descricao,
          valor: t.valor,
          banco: t.banco,
          tipo: t.account_type,
        })),
        allTransactions: matchedTxs.map((t) => ({
          id: t.id,
          data: t.data,
          titulo: t.titulo,
          descricao: t.descricao,
          valor: t.valor,
          banco: t.banco,
          tipo: t.account_type,
        })),
      });

      if (suggestions.length >= 25) break;
    }

    return {
      suggestions,
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
    set_custo_fixo?: boolean;
    ignorar_dashboard?: boolean;
  }): Promise<{
    ruleCreated: ClassificationRule;
    transactionsClassified: number;
    conflicts: any[];
  }> {
    const cat = data.categoria ? data.categoria.trim() : '';
    if (!cat || cat === 'Não classificado') {
      throw new BadRequestException(
        "Selecione uma categoria válida para criar a regra.",
      );
    }
    data.categoria = cat;

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
      rule.set_custo_fixo = !!data.set_custo_fixo;
      rule.ignorar_dashboard = !!data.ignorar_dashboard;
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
        set_custo_fixo: !!data.set_custo_fixo,
        ignorar_dashboard: !!data.ignorar_dashboard,
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
