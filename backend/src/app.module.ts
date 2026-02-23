import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { ClassificationRule } from './entities/classification-rule.entity';
import { Category } from './entities/category.entity';
import { ImportLog } from './entities/import-log.entity';
import { ImportModule } from './import/import.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RulesModule } from './rules/rules.module';
import { CategoriesModule } from './categories/categories.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ClassificationModule } from './classification/classification.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DATABASE_PATH || './data/financeiro.db',
      entities: [Transaction, ClassificationRule, Category, ImportLog],
      synchronize: true,
    }),
    ImportModule,
    TransactionsModule,
    RulesModule,
    CategoriesModule,
    DashboardModule,
    ClassificationModule,
  ],
})
export class AppModule {}
