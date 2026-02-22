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
      // Check bank scope
      if (
        rule.banco_escopo !== 'qualquer' &&
        rule.banco_escopo.toUpperCase() !== tx.banco.toUpperCase()
      ) {
        continue;
      }

      // Check sign scope
      if (rule.sinal_escopo === 'entrada' && tx.valor < 0) continue;
      if (rule.sinal_escopo === 'saida' && tx.valor > 0) continue;

      // Build test string based on campo_alvo
      let testString = '';
      if (rule.campo_alvo === 'titulo') {
        testString = normalizeForMatch(tx.titulo);
      } else if (rule.campo_alvo === 'descricao') {
        testString = normalizeForMatch(tx.descricao);
      } else {
        testString = normalizeForMatch(tx.titulo + ' ' + tx.descricao);
      }

      // Test regex
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
        // Invalid regex, skip
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
      if (
        !options?.overwriteManual &&
        tx.is_manual
      ) {
        continue;
      }
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
        changed.push({
          id: tx.id,
          before,
          after: result.categoria,
        });
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
}
