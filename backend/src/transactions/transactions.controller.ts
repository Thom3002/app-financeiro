import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { TransactionsService, TransactionFilters } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txService: TransactionsService) {}

  @Get()
  findAll(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('categoria') categoria?: string,
    @Query('subcategoria') subcategoria?: string,
    @Query('banco') banco?: string,
    @Query('busca') busca?: string,
    @Query('valorMin') valorMin?: string,
    @Query('valorMax') valorMax?: string,
    @Query('tipo') tipo?: 'entrada' | 'saida',
    @Query('somente_nao_classificados') somente_nao_classificados?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedValorMin = valorMin !== undefined ? parseFloat(valorMin) : NaN;
    const parsedValorMax = valorMax !== undefined ? parseFloat(valorMax) : NaN;
    const filters: TransactionFilters = {
      dataInicio,
      dataFim,
      categoria,
      subcategoria,
      banco,
      busca,
      valorMin: !isNaN(parsedValorMin) ? parsedValorMin : undefined,
      valorMax: !isNaN(parsedValorMax) ? parsedValorMax : undefined,
      tipo,
      somente_nao_classificados: somente_nao_classificados === 'true',
      page: parseInt(page || '1', 10) || 1,
      limit: parseInt(limit || '50', 10) || 50,
    };
    return this.txService.findAll(filters);
  }

  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: { categoria: string; subcategoria?: string },
  ) {
    const result = await this.txService.updateCategory(
      id,
      body.categoria,
      body.subcategoria,
    );
    if (!result) throw new NotFoundException('Transação não encontrada.');
    return result;
  }

  @Get('categories')
  getDistinctCategories() {
    return this.txService.getDistinctCategories();
  }

  @Get('banks')
  getDistinctBanks() {
    return this.txService.getDistinctBanks();
  }
}
