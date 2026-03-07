import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from '../entities/category.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Transaction, ClassificationRule])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
