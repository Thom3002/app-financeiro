import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
  ) {}

  private async getIgnoredCategoryNames(): Promise<string[]> {
    const ignored = await this.catRepo.find({
      where: { ignorar_dashboard: true },
    });
    return ignored.map((c) => c.nome);
  }

  private applyDashboardFilters(qb: any, dataInicio?: string, dataFim?: string, ignoredNames: string[] = []) {
    qb.andWhere('(tx.ignorar_dashboard IS NULL OR tx.ignorar_dashboard = false)');
    if (dataInicio) qb.andWhere('tx.data >= :dataInicio', { dataInicio });
    if (dataFim) qb.andWhere('tx.data <= :dataFim', { dataFim });
    if (ignoredNames.length > 0) {
      qb.andWhere('(tx.categoria IS NULL OR tx.categoria NOT IN (:...ignoredNames))', { ignoredNames });
    }
  }

  async getSummary(dataInicio?: string, dataFim?: string) {
    const ignoredNames = await this.getIgnoredCategoryNames();

    const qb = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb, dataInicio, dataFim, ignoredNames);

    // Totals
    const totals = await qb
      .select([
        'SUM(CASE WHEN tx.valor > 0 THEN tx.valor ELSE 0 END) as entradas',
        'SUM(CASE WHEN tx.valor < 0 THEN ABS(tx.valor) ELSE 0 END) as saidas',
        'SUM(tx.valor) as saldo',
        'COUNT(*) as total',
      ])
      .getRawOne();

    // By category
    const qb2 = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb2, dataInicio, dataFim, ignoredNames);

    const byCategory = await qb2
      .select([
        'tx.categoria as categoria',
        'SUM(CASE WHEN tx.valor < 0 THEN ABS(tx.valor) ELSE 0 END) as total_saidas',
        'SUM(CASE WHEN tx.valor > 0 THEN tx.valor ELSE 0 END) as total_entradas',
        'COUNT(*) as count',
      ])
      .groupBy('tx.categoria')
      .orderBy('total_saidas', 'DESC')
      .getRawMany();

    // Biggest transactions
    const qb3 = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb3, dataInicio, dataFim, ignoredNames);

    const biggest = await qb3
      .orderBy('ABS(tx.valor)', 'DESC')
      .limit(10)
      .getMany();

    return {
      entradas: parseFloat(totals.entradas) || 0,
      saidas: parseFloat(totals.saidas) || 0,
      saldo: parseFloat(totals.saldo) || 0,
      totalTransactions: parseInt(totals.total) || 0,
      byCategory,
      biggestTransactions: biggest,
      ignoredCategories: ignoredNames,
    };
  }

  async getTimeline(dataInicio?: string, dataFim?: string) {
    const ignoredNames = await this.getIgnoredCategoryNames();

    const qb = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb, dataInicio, dataFim, ignoredNames);

    const results = await qb
      .select([
        "SUBSTR(tx.data, 1, 7) as mes",
        'SUM(CASE WHEN tx.valor > 0 THEN tx.valor ELSE 0 END) as entradas',
        'SUM(CASE WHEN tx.valor < 0 THEN ABS(tx.valor) ELSE 0 END) as saidas',
        'SUM(tx.valor) as saldo',
        'COUNT(*) as count',
      ])
      .groupBy('mes')
      .orderBy('mes', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      mes: r.mes,
      entradas: parseFloat(r.entradas) || 0,
      saidas: parseFloat(r.saidas) || 0,
      saldo: parseFloat(r.saldo) || 0,
      count: parseInt(r.count) || 0,
    }));
  }

  async getDrilldown(
    categoria: string,
    dataInicio?: string,
    dataFim?: string,
  ) {
    const qb = this.txRepo.createQueryBuilder('tx');
    qb.where('tx.categoria = :categoria', { categoria });
    if (dataInicio) qb.andWhere('tx.data >= :dataInicio', { dataInicio });
    if (dataFim) qb.andWhere('tx.data <= :dataFim', { dataFim });

    // Subcategory breakdown
    const bySubcategory = await qb
      .select([
        'tx.subcategoria as subcategoria',
        'SUM(CASE WHEN tx.valor < 0 THEN ABS(tx.valor) ELSE 0 END) as total_saidas',
        'SUM(CASE WHEN tx.valor > 0 THEN tx.valor ELSE 0 END) as total_entradas',
        'COUNT(*) as count',
      ])
      .groupBy('tx.subcategoria')
      .orderBy('total_saidas', 'DESC')
      .getRawMany();

    // Top transactions in this category
    const qb2 = this.txRepo.createQueryBuilder('tx');
    qb2.where('tx.categoria = :categoria', { categoria });
    if (dataInicio) qb2.andWhere('tx.data >= :dataInicio', { dataInicio });
    if (dataFim) qb2.andWhere('tx.data <= :dataFim', { dataFim });

    const transactions = await qb2
      .orderBy('tx.data', 'DESC')
      .getMany();

    return {
      categoria,
      bySubcategory,
      transactions,
    };
  }
}
