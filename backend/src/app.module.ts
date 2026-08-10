import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
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

import { PluggyItem } from './entities/pluggy-item.entity';
import { Setting } from './entities/setting.entity';
import { PluggyModule } from './pluggy/pluggy.module';

import { existsSync } from 'fs';

function getFrontendDistPath(): string {
  const candidates = [
    join(process.env.APP_PATH || '', '..', 'frontend', 'dist'),
    join((process as any).resourcesPath || '', 'frontend', 'dist'),
    join(process.cwd(), '..', 'frontend', 'dist'),
    join(process.cwd(), 'frontend', 'dist'),
  ];
  for (const pathCandidate of candidates) {
    if (pathCandidate && existsSync(pathCandidate)) {
      return pathCandidate;
    }
  }
  return candidates[0];
}

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: getFrontendDistPath(),
      exclude: ['/api/(.*)'],
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DATABASE_PATH || './data/financeiro.db',
      entities: [Transaction, ClassificationRule, Category, ImportLog, PluggyItem, Setting],
      synchronize: true,
    }),
    ImportModule,
    TransactionsModule,
    RulesModule,
    CategoriesModule,
    DashboardModule,
    ClassificationModule,
    PluggyModule,
  ],
})
export class AppModule {}
