import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';

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
      qb.andWhere('tx.categoria = :categoria', {
        categoria: filters.categoria,
      });
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
      tx.is_manual = true;
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
      tx.is_manual = true;

      // Se solicitado, criar uma regra de autoclassificação baseada na descrição/título
      if (dto.createRulePattern && tx.categoria) {
        const newRule = this.ruleRepo.create({
          regex: dto.createRulePattern,
          categoria: tx.categoria,
          subcategoria: tx.subcategoria || null,
          banco_escopo: 'qualquer',
          sinal_escopo: 'qualquer',
          campo_alvo: 'ambos',
          priority: 100,
          enabled: true,
          set_custo_fixo: tx.is_custo_fixo || false,
        });
        await this.ruleRepo.save(newRule);
        tx.matched_rule_id = newRule.id;
      }
    }

    return this.txRepo.save(tx);
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
