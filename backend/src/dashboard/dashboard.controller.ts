import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashService: DashboardService) {}

  @Get('summary')
  getSummary(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashService.getSummary(dataInicio, dataFim);
  }

  @Get('timeline')
  getTimeline(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashService.getTimeline(dataInicio, dataFim);
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
