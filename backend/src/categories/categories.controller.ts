import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catService: CategoriesService) {}

  @Get()
  findAll() {
    return this.catService.findAll();
  }

  @Get('flat')
  findAllFlat() {
    return this.catService.findAllFlat();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const cat = await this.catService.findOne(id);
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return cat;
  }

  @Post()
  create(@Body() body: { nome: string; parent_id?: string; cor?: string; icone?: string }) {
    return this.catService.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const cat = await this.catService.update(id, body);
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return cat;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const cat = await this.catService.remove(id);
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return { deleted: true };
  }
}
