import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';

import { ClassificationRule } from '../entities/classification-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Category, ClassificationRule])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
