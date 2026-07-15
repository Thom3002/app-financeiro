import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';

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

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
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
    categoria: string,
    subcategoria?: string,
  ) {
    const tx = await this.txRepo.findOneBy({ id });
    if (!tx) return null;

    tx.categoria = categoria;
    tx.subcategoria = subcategoria || null;
    tx.is_manual = true;
    tx.matched_rule_id = null;

    return this.txRepo.save(tx);
  }

  async getDistinctCategories(): Promise<string[]> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('DISTINCT tx.categoria', 'categoria')
      .where('tx.categoria IS NOT NULL')
      .getRawMany();
    return result.map((r) => r.categoria).filter(Boolean);
  }

  async getDistinctBanks(): Promise<string[]> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('DISTINCT tx.banco', 'banco')
      .getRawMany();
    return result.map((r) => r.banco).filter(Boolean);
  }
}
