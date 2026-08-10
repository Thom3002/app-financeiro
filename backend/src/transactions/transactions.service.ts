import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ImportLog } from '../entities/import-log.entity';
import { PluggyItem } from '../entities/pluggy-item.entity';
import { Setting } from '../entities/setting.entity';
import { CategoriesService } from '../categories/categories.service';

export interface TransactionFilters {
  dataInicio?: string;
  dataFim?: string;
  categoria?: string;
  subcategoria?: string;
  banco?: string;
  busca?: string;
  valorMin?: number;
  valorMax?: number;
  tipo?: 'entrada' | 'saida';
  somente_nao_classificados?: boolean;
  ordem?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface UpdateTransactionDto {
  categoria?: string;
  subcategoria?: string;
  ignorar_dashboard?: boolean;
  ignore_reason?: string;
  is_custo_fixo?: boolean;
  custo_fixo_grupo?: string;
  is_manual?: boolean;
  createRulePattern?: string; // se informado, cria uma regra regex automática
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
    @InjectRepository(ImportLog)
    private readonly logRepo: Repository<ImportLog>,
    @InjectRepository(PluggyItem)
    private readonly itemRepo: Repository<PluggyItem>,
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAll(filters: TransactionFilters) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.txRepo.createQueryBuilder('tx');

    if (filters.dataInicio) {
      qb.andWhere('tx.data >= :dataInicio', {
        dataInicio: filters.dataInicio,
      });
    }
    if (filters.dataFim) {
      qb.andWhere('tx.data <= :dataFim', { dataFim: filters.dataFim });
    }
    if (filters.categoria) {
      const catList = Array.isArray(filters.categoria)
        ? filters.categoria
        : typeof filters.categoria === 'string'
        ? (filters.categoria as string).split(',').map((c) => c.trim()).filter(Boolean)
        : [filters.categoria];

      if (catList.length === 1) {
        qb.andWhere('(tx.categoria = :cat OR tx.subcategoria = :cat)', { cat: catList[0] });
      } else if (catList.length > 1) {
        qb.andWhere('(tx.categoria IN (:...cats) OR tx.subcategoria IN (:...cats))', { cats: catList });
      }
    }
    if (filters.subcategoria) {
      qb.andWhere('tx.subcategoria = :subcategoria', {
        subcategoria: filters.subcategoria,
      });
    }
    if (filters.banco) {
      qb.andWhere('tx.banco = :banco', { banco: filters.banco });
    }
    if (filters.busca) {
      qb.andWhere(
        '(LOWER(tx.titulo) LIKE :busca OR LOWER(tx.descricao) LIKE :busca)',
        { busca: `%${filters.busca.toLowerCase()}%` },
      );
    }
    if (filters.valorMin !== undefined) {
      qb.andWhere('ABS(tx.valor) >= :valorMin', {
        valorMin: filters.valorMin,
      });
    }
    if (filters.valorMax !== undefined) {
      qb.andWhere('ABS(tx.valor) <= :valorMax', {
        valorMax: filters.valorMax,
      });
    }
    if (filters.tipo === 'entrada') {
      qb.andWhere('tx.valor > 0');
    } else if (filters.tipo === 'saida') {
      qb.andWhere('tx.valor < 0');
    }
    if (filters.somente_nao_classificados) {
      qb.andWhere(
        "(tx.categoria IS NULL OR tx.categoria = 'Não classificado')",
      );
    }

    const ordem = filters.ordem === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy('tx.data', ordem)
      .addOrderBy('tx.created_at', ordem)
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateCategory(
    id: string,
    dto: UpdateTransactionDto | string,
    subcategoriaParam?: string,
  ) {
    const tx = await this.txRepo.findOneBy({ id });
    if (!tx) return null;

    if (typeof dto === 'string') {
      tx.categoria = dto;
      tx.subcategoria = subcategoriaParam || null;
      tx.is_manual = !!(dto && dto !== 'Não classificado');
      tx.matched_rule_id = null;
    } else {
      if (dto.categoria !== undefined) tx.categoria = dto.categoria;
      if (dto.subcategoria !== undefined) tx.subcategoria = dto.subcategoria;
      if (dto.ignorar_dashboard !== undefined) {
        tx.ignorar_dashboard = dto.ignorar_dashboard;
        if (dto.ignore_reason !== undefined) {
          tx.ignore_reason = dto.ignore_reason;
        } else if (dto.ignorar_dashboard) {
          tx.ignore_reason = 'Definido manualmente pelo usuário';
        } else {
          tx.ignore_reason = null;
        }
      }
      if (dto.is_custo_fixo !== undefined) tx.is_custo_fixo = dto.is_custo_fixo;
      if (dto.custo_fixo_grupo !== undefined) tx.custo_fixo_grupo = dto.custo_fixo_grupo;

      if (!tx.categoria || tx.categoria === 'Não classificado') {
        tx.is_manual = false;
        tx.matched_rule_id = null;
      } else {
        tx.is_manual = dto.is_manual !== undefined ? dto.is_manual : true;
      }

      // Se solicitado, criar uma regra de autoclassificação baseada na descrição/título
      const patternToUse = dto.createRulePattern || (dto as any).rulePattern || (dto as any).createRulePattern;
      if (patternToUse && tx.categoria && tx.categoria.trim() !== '' && tx.categoria !== 'Não classificado') {
        const cleanPattern = patternToUse.trim();
        const existingRule = await this.ruleRepo.findOne({
          where: { regex: cleanPattern },
        });

        if (existingRule) {
          existingRule.categoria = tx.categoria;
          existingRule.subcategoria = tx.subcategoria || null;
          existingRule.set_custo_fixo = tx.is_custo_fixo || false;
          await this.ruleRepo.save(existingRule);
          tx.matched_rule_id = existingRule.id;
        } else {
          const newRule = this.ruleRepo.create({
            regex: cleanPattern,
            categoria: tx.categoria,
            subcategoria: tx.subcategoria || null,
            banco_escopo: 'qualquer',
            sinal_escopo: 'qualquer',
            campo_alvo: 'ambos',
            priority: 100,
            enabled: true,
            set_custo_fixo: tx.is_custo_fixo || false,
          });
        }
      }
    }

    if (tx.categoria && tx.categoria !== 'Não classificado') {
      await this.categoriesService.ensureExists(tx.categoria, tx.subcategoria);
    }

    return this.txRepo.save(tx);
  }

  async resetApp(resetType: 'transactions' | 'full' = 'transactions') {
    // 1. Limpar transações, histórico de importação e conexões Pluggy
    await this.txRepo.clear();
    await this.logRepo.clear();
    await this.itemRepo.clear();

    // 2. Se reset for 'full', apagar também regras, categorias personalizadas e configurações
    if (resetType === 'full') {
      await this.ruleRepo.clear();
      await this.catRepo.clear();
      await this.settingRepo.clear();
    }

    return { success: true, resetType };
  }

  async getDistinctCategories(): Promise<string[]> {
    const dbCats = await this.catRepo.find({ select: ['nome'] });
    const txCats = await this.txRepo
      .createQueryBuilder('tx')
      .select('DISTINCT tx.categoria', 'categoria')
      .where('tx.categoria IS NOT NULL')
      .getRawMany();

    const set = new Set<string>();
    dbCats.forEach((c) => c.nome && set.add(c.nome));
    txCats.forEach((r) => r.categoria && set.add(r.categoria));

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  async getDistinctBanks(): Promise<string[]> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('DISTINCT tx.banco', 'banco')
      .getRawMany();
    return result.map((r) => r.banco).filter(Boolean);
  }
}
