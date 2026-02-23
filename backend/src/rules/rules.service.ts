import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassifierService } from '../services/classifier.service';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly classifierService: ClassifierService,
  ) {}

  findAll() {
    return this.ruleRepo.find({ order: { priority: 'ASC' } });
  }

  findOne(id: string) {
    return this.ruleRepo.findOneBy({ id });
  }

  async create(data: Partial<ClassificationRule>) {
    const rule = this.ruleRepo.create(data);
    const saved = await this.ruleRepo.save(rule);
    await this.classifierService.reclassifyAll();
    return saved;
  }

  async update(id: string, data: Partial<ClassificationRule>) {
    await this.ruleRepo.update(id, data);
    const updated = await this.ruleRepo.findOneBy({ id });
    await this.classifierService.reclassifyAll();
    return updated;
  }

  async remove(id: string) {
    const rule = await this.ruleRepo.findOneBy({ id });
    if (rule) {
      await this.ruleRepo.remove(rule);
      await this.classifierService.reclassifyAll();
    }
    return rule;
  }

  testRule(regex: string, text: string) {
    return this.classifierService.testRule(regex, text);
  }

  async simulate(filters: {
    dataInicio?: string;
    dataFim?: string;
    banco?: string;
    somente_nao_classificados?: boolean;
    overwrite_manual?: boolean;
  }) {
    const qb = this.txRepo.createQueryBuilder('tx');

    if (filters.dataInicio) {
      qb.andWhere('tx.data >= :dataInicio', { dataInicio: filters.dataInicio });
    }
    if (filters.dataFim) {
      qb.andWhere('tx.data <= :dataFim', { dataFim: filters.dataFim });
    }
    if (filters.banco) {
      qb.andWhere('tx.banco = :banco', { banco: filters.banco });
    }

    const transactions = await qb.getMany();

    const result = await this.classifierService.classifyMany(transactions, {
      onlyUnclassified: filters.somente_nao_classificados,
      overwriteManual: filters.overwrite_manual,
    });

    return {
      totalAnalyzed: result.total,
      totalChanged: result.changed.length,
      changes: result.changed.slice(0, 50),
    };
  }

  async reprocess(filters: {
    dataInicio?: string;
    dataFim?: string;
    banco?: string;
    somente_nao_classificados?: boolean;
    overwrite_manual?: boolean;
  }) {
    const qb = this.txRepo.createQueryBuilder('tx');

    if (filters.dataInicio) {
      qb.andWhere('tx.data >= :dataInicio', { dataInicio: filters.dataInicio });
    }
    if (filters.dataFim) {
      qb.andWhere('tx.data <= :dataFim', { dataFim: filters.dataFim });
    }
    if (filters.banco) {
      qb.andWhere('tx.banco = :banco', { banco: filters.banco });
    }

    const transactions = await qb.getMany();

    const result = await this.classifierService.classifyMany(transactions, {
      onlyUnclassified: filters.somente_nao_classificados,
      overwriteManual: filters.overwrite_manual,
    });

    // Save changed transactions
    const changedIds = result.changed.map((c) => c.id);
    const toSave = transactions.filter((t) => changedIds.includes(t.id));
    if (toSave.length > 0) {
      await this.txRepo.save(toSave, { chunk: 500 });
    }

    return {
      totalAnalyzed: result.total,
      totalChanged: result.changed.length,
      changes: result.changed.slice(0, 50),
    };
  }

  async importRules(
    rules: Partial<ClassificationRule>[],
  ): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    for (const ruleData of rules) {
      try {
        if (!ruleData.regex || !ruleData.categoria) {
          errors.push(
            `Regra inválida: regex e categoria são obrigatórios.`,
          );
          continue;
        }
        // Test regex validity
        new RegExp(ruleData.regex);

        const rule = this.ruleRepo.create({
          regex: ruleData.regex,
          campo_alvo: ruleData.campo_alvo || 'ambos',
          banco_escopo: ruleData.banco_escopo || 'qualquer',
          sinal_escopo: ruleData.sinal_escopo || 'qualquer',
          categoria: ruleData.categoria,
          subcategoria: ruleData.subcategoria || null,
          priority: ruleData.priority || 100,
          enabled: ruleData.enabled !== false,
          overwrite_manual: ruleData.overwrite_manual || false,
        });
        await this.ruleRepo.save(rule);
        imported++;
      } catch (e) {
        errors.push(`Erro: ${(e as Error).message}`);
      }
    }

    // Reclassify all after bulk import
    if (imported > 0) {
      await this.classifierService.reclassifyAll();
    }

    return { imported, errors };
  }

  async exportRules(): Promise<ClassificationRule[]> {
    return this.ruleRepo.find({ order: { priority: 'ASC' } });
  }
}
