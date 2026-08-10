import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ImportLog } from '../entities/import-log.entity';
import { PluggyItem } from '../entities/pluggy-item.entity';
import { Setting } from '../entities/setting.entity';

import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Category,
      ClassificationRule,
      ImportLog,
      PluggyItem,
      Setting,
    ]),
    CategoriesModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}

