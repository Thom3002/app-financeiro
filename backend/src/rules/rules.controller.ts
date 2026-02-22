import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { RulesService } from './rules.service';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  findAll() {
    return this.rulesService.findAll();
  }

  @Get('export')
  exportRules() {
    return this.rulesService.exportRules();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const rule = await this.rulesService.findOne(id);
    if (!rule) throw new NotFoundException('Regra não encontrada.');
    return rule;
  }

  @Post()
  create(@Body() body: any) {
    return this.rulesService.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const rule = await this.rulesService.update(id, body);
    if (!rule) throw new NotFoundException('Regra não encontrada.');
    return rule;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const rule = await this.rulesService.remove(id);
    if (!rule) throw new NotFoundException('Regra não encontrada.');
    return { deleted: true };
  }

  @Post('test')
  testRule(@Body() body: { regex: string; text: string }) {
    return this.rulesService.testRule(body.regex, body.text);
  }

  @Post('simulate')
  simulate(@Body() body: any) {
    return this.rulesService.simulate(body);
  }

  @Post('reprocess')
  reprocess(@Body() body: any) {
    return this.rulesService.reprocess(body);
  }

  @Post('import')
  importRules(@Body() body: { rules: any[] }) {
    return this.rulesService.importRules(body.rules);
  }
}
