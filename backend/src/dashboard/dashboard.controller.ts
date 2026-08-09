import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashService: DashboardService) {}

  @Get('summary')
  getSummary(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('categorias') categorias?: string,
  ) {
    return this.dashService.getSummary(dataInicio, dataFim, categorias);
  }

  @Get('timeline')
  getTimeline(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('categorias') categorias?: string,
  ) {
    return this.dashService.getTimeline(dataInicio, dataFim, categorias);
  }

  @Get('export-excel')
  async exportExcel(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('categorias') categorias?: string,
  ) {
    const buffer = await this.dashService.exportExcel(dataInicio, dataFim, categorias);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Dashboard_Financeiro.xlsx"',
    );
    res.send(buffer);
  }

  @Get('drilldown/:categoria')
  getDrilldown(
    @Param('categoria') categoria: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashService.getDrilldown(categoria, dataInicio, dataFim);
  }
}


