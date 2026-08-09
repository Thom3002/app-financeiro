import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassifierService } from '../services/classifier.service';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly classifierService: ClassifierService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAll() {
    // Excluir regras legadas sem categoria ou com 'Não classificado'
    await this.ruleRepo
      .createQueryBuilder()
      .delete()
      .from(ClassificationRule)
      .where("categoria IS NULL OR TRIM(categoria) = '' OR categoria = 'Não classificado'")
      .execute();

    return this.ruleRepo.find({ order: { priority: 'ASC' } });
  }

  findOne(id: string) {
    return this.ruleRepo.findOneBy({ id });
  }

  async create(data: Partial<ClassificationRule>) {
    const cat = data.categoria ? data.categoria.trim() : '';
    if (!cat || cat === 'Não classificado') {
      throw new BadRequestException(
        "Não é permitido criar regras com a categoria 'Não classificado' ou vazia.",
      );
    }
    const cleanRegex = data.regex ? data.regex.trim() : '';
    if (!cleanRegex) {
      throw new BadRequestException('O campo regex não pode ser vazio.');
    }

    const allRules = await this.ruleRepo.find();
    const existingSameRegex = allRules.find(
      (r) => r.regex.trim().toLowerCase() === cleanRegex.toLowerCase(),
    );

    if (existingSameRegex) {
      throw new ConflictException(
        `Já existe uma regra cadastrada com o mesmo regex '${cleanRegex}' para a categoria '${existingSameRegex.categoria}'.`,
      );
    }

    data.regex = cleanRegex;
    data.categoria = cat;
    const rule = this.ruleRepo.create(data);
    const saved = await this.ruleRepo.save(rule);
    await this.categoriesService.ensureExists(saved.categoria, saved.subcategoria);
    await this.classifierService.reclassifyAll();
    return saved;
  }

  async update(id: string, data: Partial<ClassificationRule>) {
    if (data.categoria !== undefined) {
      const cat = data.categoria ? data.categoria.trim() : '';
      if (!cat || cat === 'Não classificado') {
        throw new BadRequestException(
          "Não é permitido atualizar regras com a categoria 'Não classificado' ou vazia.",
        );
      }
      data.categoria = cat;
    }

    if (data.regex !== undefined) {
      const cleanRegex = data.regex.trim();
      if (!cleanRegex) {
        throw new BadRequestException('O campo regex não pode ser vazio.');
      }

      const allRules = await this.ruleRepo.find();
      const existingSameRegex = allRules.find(
        (r) =>
          r.id !== id &&
          r.regex.trim().toLowerCase() === cleanRegex.toLowerCase(),
      );

      if (existingSameRegex) {
        throw new ConflictException(
          `Já existe outra regra cadastrada com o mesmo regex '${cleanRegex}' para a categoria '${existingSameRegex.categoria}'.`,
        );
      }
      data.regex = cleanRegex;
    }

    await this.ruleRepo.update(id, data);
    const updated = await this.ruleRepo.findOneBy({ id });
    if (updated) {
      await this.categoriesService.ensureExists(updated.categoria, updated.subcategoria);
    }
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
