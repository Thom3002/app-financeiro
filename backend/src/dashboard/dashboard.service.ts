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

  private applyDashboardFilters(
    qb: any,
    dataInicio?: string,
    dataFim?: string,
    ignoredNames: string[] = [],
    selectedCategories?: string,
  ) {
    qb.andWhere('(tx.ignorar_dashboard IS NULL OR tx.ignorar_dashboard = false)');
    if (dataInicio) qb.andWhere('tx.data >= :dataInicio', { dataInicio });
    if (dataFim) qb.andWhere('tx.data <= :dataFim', { dataFim });
    if (ignoredNames.length > 0) {
      qb.andWhere('(tx.categoria IS NULL OR tx.categoria NOT IN (:...ignoredNames))', { ignoredNames });
    }
    if (selectedCategories) {
      const catList = selectedCategories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (catList.length > 0) {
        qb.andWhere('tx.categoria IN (:...catList)', { catList });
      }
    }
  }

  async getSummary(dataInicio?: string, dataFim?: string, categorias?: string) {
    const ignoredNames = await this.getIgnoredCategoryNames();

    const qb = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb, dataInicio, dataFim, ignoredNames, categorias);

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
    this.applyDashboardFilters(qb2, dataInicio, dataFim, ignoredNames, categorias);

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
    this.applyDashboardFilters(qb3, dataInicio, dataFim, ignoredNames, categorias);

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

  async getTimeline(dataInicio?: string, dataFim?: string, categorias?: string) {
    const ignoredNames = await this.getIgnoredCategoryNames();

    const qb = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb, dataInicio, dataFim, ignoredNames, categorias);

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

  async exportExcel(
    dataInicio?: string,
    dataFim?: string,
    categorias?: string,
  ): Promise<Buffer> {
    const ignoredNames = await this.getIgnoredCategoryNames();
    const qb = this.txRepo.createQueryBuilder('tx');
    this.applyDashboardFilters(qb, dataInicio, dataFim, ignoredNames, categorias);
    qb.orderBy('tx.data', 'DESC');
    const transactions = await qb.getMany();

    const receitas = transactions.filter((t) => t.valor > 0);
    const despesas = transactions.filter((t) => t.valor < 0);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'App Financeiro';
    workbook.created = new Date();

    const setupSheet = (sheet: any, title: string, rows: Transaction[], isIncome: boolean) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.columns = [
        { header: 'Data', key: 'data', width: 14 },
        { header: 'Título', key: 'titulo', width: 30 },
        { header: 'Descrição', key: 'descricao', width: 40 },
        { header: 'Categoria', key: 'categoria', width: 22 },
        { header: 'Subcategoria', key: 'subcategoria', width: 22 },
        { header: 'Banco', key: 'banco', width: 16 },
        { header: 'Valor (R$)', key: 'valor', width: 18 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isIncome ? '15803D' : 'B91C1C' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      let total = 0;
      rows.forEach((tx) => {
        total += tx.valor;
        const row = sheet.addRow({
          data: tx.data,
          titulo: tx.titulo || '',
          descricao: tx.descricao || '',
          categoria: tx.categoria || 'Não classificado',
          subcategoria: tx.subcategoria || '',
          banco: tx.banco || '',
          valor: tx.valor,
        });

        const cellValor = row.getCell('valor');
        cellValor.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;R$ 0.00';
      });

      const summaryRow = sheet.addRow({
        data: 'TOTAL',
        titulo: `${rows.length} lançamento(s)`,
        descricao: '',
        categoria: '',
        subcategoria: '',
        banco: '',
        valor: total,
      });
      summaryRow.font = { bold: true, size: 11 };
      const totalCell = summaryRow.getCell('valor');
      totalCell.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;R$ 0.00';
      summaryRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E2E8F0' },
      };
    };

    const sheetReceitas = workbook.addWorksheet('Receitas');
    setupSheet(sheetReceitas, 'Receitas', receitas, true);

    const sheetDespesas = workbook.addWorksheet('Despesas');
    setupSheet(sheetDespesas, 'Despesas', despesas, false);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
