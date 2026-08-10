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

    const existingRules = await this.ruleRepo.find();
    const existingRegexMap = new Map<string, ClassificationRule>();
    existingRules.forEach((r) => {
      if (r.regex) existingRegexMap.set(r.regex.trim().toLowerCase(), r);
    });

    for (const ruleData of rules) {
      try {
        const cleanRegex = ruleData.regex ? ruleData.regex.trim() : '';
        const cat = ruleData.categoria ? ruleData.categoria.trim() : '';

        if (!cleanRegex || !cat || cat === 'Não classificado') {
          errors.push(
            `Regra inválida ou com categoria 'Não classificado'/vazia: '${cleanRegex || 'sem regex'}'.`,
          );
          continue;
        }

        // Test regex validity
        new RegExp(cleanRegex);

        const lowerRegex = cleanRegex.toLowerCase();
        let ruleToSave: ClassificationRule;

        if (existingRegexMap.has(lowerRegex)) {
          // Atualiza regra existente em vez de duplicar
          ruleToSave = existingRegexMap.get(lowerRegex)!;
          ruleToSave.categoria = cat;
          ruleToSave.subcategoria = ruleData.subcategoria || null;
          ruleToSave.campo_alvo = ruleData.campo_alvo || ruleToSave.campo_alvo || 'ambos';
          ruleToSave.banco_escopo = ruleData.banco_escopo || ruleToSave.banco_escopo || 'qualquer';
          ruleToSave.sinal_escopo = ruleData.sinal_escopo || ruleToSave.sinal_escopo || 'qualquer';
          ruleToSave.priority = ruleData.priority || ruleToSave.priority || 100;
          ruleToSave.enabled = ruleData.enabled !== false;
          ruleToSave.overwrite_manual = ruleData.overwrite_manual || false;
          ruleToSave.set_custo_fixo = ruleData.set_custo_fixo || false;
          ruleToSave.ignorar_dashboard = ruleData.ignorar_dashboard || false;
        } else {
          ruleToSave = this.ruleRepo.create({
            regex: cleanRegex,
            campo_alvo: ruleData.campo_alvo || 'ambos',
            banco_escopo: ruleData.banco_escopo || 'qualquer',
            sinal_escopo: ruleData.sinal_escopo || 'qualquer',
            categoria: cat,
            subcategoria: ruleData.subcategoria || null,
            priority: ruleData.priority || 100,
            enabled: ruleData.enabled !== false,
            overwrite_manual: ruleData.overwrite_manual || false,
            set_custo_fixo: ruleData.set_custo_fixo || false,
            ignorar_dashboard: ruleData.ignorar_dashboard || false,
          });
        }

        const saved = await this.ruleRepo.save(ruleToSave);
        existingRegexMap.set(lowerRegex, saved);
        await this.categoriesService.ensureExists(saved.categoria, saved.subcategoria);
        imported++;
      } catch (e) {
        errors.push(`Erro ao importar regra: ${(e as Error).message}`);
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
