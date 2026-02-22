import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
  ) {}

  async findAll() {
    const categories = await this.catRepo.find({
      where: { parent_id: IsNull() },
      relations: ['children'],
      order: { nome: 'ASC' },
    });
    return categories;
  }

  async findAllFlat() {
    return this.catRepo.find({
      relations: ['children'],
      order: { nome: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.catRepo.findOne({
      where: { id },
      relations: ['children'],
    });
  }

  create(data: { nome: string; parent_id?: string; cor?: string; icone?: string }) {
    const cat = this.catRepo.create(data);
    return this.catRepo.save(cat);
  }

  async update(id: string, data: Partial<Category>) {
    await this.catRepo.update(id, data);
    return this.catRepo.findOneBy({ id });
  }

  async remove(id: string) {
    const cat = await this.catRepo.findOneBy({ id });
    if (cat) await this.catRepo.remove(cat);
    return cat;
  }
}
