import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';

export interface ClassificationResult {
  categoria: string;
  subcategoria: string | null;
  matched_rule_id: string | null;
}

function normalizeForMatch(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

@Injectable()
export class ClassifierService {
  constructor(
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async loadRules(): Promise<ClassificationRule[]> {
    return this.ruleRepo.find({
      where: { enabled: true },
      order: { priority: 'ASC' },
    });
  }

  classifyTransaction(
    tx: { titulo: string; descricao: string; valor: number; banco: string },
    rules: ClassificationRule[],
  ): ClassificationResult {
    for (const rule of rules) {
      if (
        rule.banco_escopo !== 'qualquer' &&
        rule.banco_escopo.toUpperCase() !== tx.banco.toUpperCase()
      ) {
        continue;
      }
      if (rule.sinal_escopo === 'entrada' && tx.valor < 0) continue;
      if (rule.sinal_escopo === 'saida' && tx.valor > 0) continue;

      let testString = '';
      if (rule.campo_alvo === 'titulo') {
        testString = normalizeForMatch(tx.titulo);
      } else if (rule.campo_alvo === 'descricao') {
        testString = normalizeForMatch(tx.descricao);
      } else {
        testString = normalizeForMatch(tx.titulo + ' ' + tx.descricao);
      }

      try {
        const regex = new RegExp(rule.regex, 'i');
        if (regex.test(testString)) {
          return {
            categoria: rule.categoria,
            subcategoria: rule.subcategoria || null,
            matched_rule_id: rule.id,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      categoria: 'Não classificado',
      subcategoria: null,
      matched_rule_id: null,
    };
  }

  async classifyMany(
    transactions: Transaction[],
    options?: { onlyUnclassified?: boolean; overwriteManual?: boolean },
  ): Promise<{
    changed: { id: string; before: string; after: string }[];
    total: number;
  }> {
    const rules = await this.loadRules();
    const changed: { id: string; before: string; after: string }[] = [];

    for (const tx of transactions) {
      if (!options?.overwriteManual && tx.is_manual) continue;
      if (
        options?.onlyUnclassified &&
        tx.categoria &&
        tx.categoria !== 'Não classificado'
      ) {
        continue;
      }

      const result = this.classifyTransaction(tx, rules);
      const before = tx.categoria || 'Não classificado';
      if (
        result.categoria !== before ||
        result.subcategoria !== tx.subcategoria
      ) {
        changed.push({ id: tx.id, before, after: result.categoria });
        tx.categoria = result.categoria;
        tx.subcategoria = result.subcategoria;
        tx.matched_rule_id = result.matched_rule_id;
      }
    }

    return { changed, total: transactions.length };
  }

  testRule(
    regex: string,
    text: string,
  ): { matches: boolean; error?: string } {
    try {
      const r = new RegExp(regex, 'i');
      return { matches: r.test(text) };
    } catch (e) {
      return { matches: false, error: (e as Error).message };
    }
  }

  // --- New methods ---

  /**
   * Converts comma-separated keywords to a regex pattern.
   * "uber, 99 pop, taxi" → "(?:uber|99\\s*pop|taxi)"
   */
  keywordsToRegex(keywords: string): string {
    const parts = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) =>
        k
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars
          .replace(/\s+/g, '\\s*'), // spaces become flexible whitespace
      );
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `(?:${parts.join('|')})`;
  }

  /**
   * Reclassify ALL non-manual transactions using current rules.
   * Called after every rule create/edit/delete.
   */
  async reclassifyAll(): Promise<{ totalChanged: number }> {
    const rules = await this.loadRules();
    const allTxs = await this.txRepo.find();

    const changedTxs: Transaction[] = [];

    for (const tx of allTxs) {
      if (tx.is_manual) continue;

      const result = this.classifyTransaction(tx, rules);
      const changed =
        result.categoria !== tx.categoria ||
        result.subcategoria !== tx.subcategoria;

      if (changed) {
        tx.categoria = result.categoria;
        tx.subcategoria = result.subcategoria;
        tx.matched_rule_id = result.matched_rule_id;
        changedTxs.push(tx);
      }
    }

    // Batch save changed transactions
    if (changedTxs.length > 0) {
      await this.txRepo.save(changedTxs, { chunk: 500 });
    }

    return { totalChanged: changedTxs.length };
  }

  /**
   * Detect conflicting rules: finds existing rules whose regex can match
   * the same transactions as the given regex pattern AND point to a
   * different category/subcategory (same destination = not a real conflict).
   */
  async detectConflicts(
    newRegex: string,
    excludeRuleId?: string,
    newCategoria?: string,
    newSubcategoria?: string | null,
  ): Promise<{
    conflicts: {
      rule: ClassificationRule;
      overlapCount: number;
      examples: { titulo: string; descricao: string }[];
    }[];
  }> {
    const rules = await this.loadRules();
    const allTxs = await this.txRepo.find();
    const conflicts: {
      rule: ClassificationRule;
      overlapCount: number;
      examples: { titulo: string; descricao: string }[];
    }[] = [];

    let newRe: RegExp;
    try {
      newRe = new RegExp(newRegex, 'i');
    } catch {
      return { conflicts: [] };
    }

    // Find transactions that match the new regex
    const newMatches = new Set<string>();
    for (const tx of allTxs) {
      const text = normalizeForMatch(tx.titulo + ' ' + tx.descricao);
      if (newRe.test(text)) {
        newMatches.add(tx.id);
      }
    }

    // Check overlap with each existing rule
    for (const rule of rules) {
      if (excludeRuleId && rule.id === excludeRuleId) continue;

      // Skip if both rules point to the same destination — not a real conflict
      if (
        newCategoria &&
        rule.categoria === newCategoria &&
        (rule.subcategoria || null) === (newSubcategoria || null)
      ) {
        continue;
      }

      let ruleRe: RegExp;
      try {
        ruleRe = new RegExp(rule.regex, 'i');
      } catch {
        continue;
      }

      const overlapping: { titulo: string; descricao: string }[] = [];
      for (const tx of allTxs) {
        if (!newMatches.has(tx.id)) continue;
        const text = normalizeForMatch(tx.titulo + ' ' + tx.descricao);
        if (ruleRe.test(text)) {
          if (overlapping.length < 3) {
            overlapping.push({ titulo: tx.titulo, descricao: tx.descricao });
          }
        }
      }

      if (overlapping.length > 0) {
        // Count total overlaps
        let overlapCount = 0;
        for (const tx of allTxs) {
          if (!newMatches.has(tx.id)) continue;
          const text = normalizeForMatch(tx.titulo + ' ' + tx.descricao);
          if (ruleRe.test(text)) overlapCount++;
        }

        conflicts.push({
          rule,
          overlapCount,
          examples: overlapping,
        });
      }
    }

    return { conflicts };
  }
}
