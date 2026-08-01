import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ClassificationService } from './classification.service';

@Controller('classification')
export class ClassificationController {
  constructor(
    private readonly classificationService: ClassificationService,
  ) {}

  @Get('suggestions')
  getSuggestions(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.classificationService.getSuggestions(dataInicio, dataFim);
  }

  @Post('preview-keyword')
  previewKeyword(
    @Body() body: { keywords: string; campo_alvo?: string },
  ) {
    return this.classificationService.previewKeyword(
      body.keywords,
      body.campo_alvo,
    );
  }

  @Post('apply')
  apply(
    @Body()
    body: {
      keywords: string;
      categoria: string;
      subcategoria?: string;
      campo_alvo?: string;
      set_custo_fixo?: boolean;
      ignorar_dashboard?: boolean;
    },
  ) {
    return this.classificationService.apply(body);
  }

  @Post('reorder')
  reorder(@Body() body: { ruleIds: string[] }) {
    return this.classificationService.reorderPriorities(body.ruleIds);
  }
}
