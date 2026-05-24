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

@Module({
  imports: [
    ServeStaticModule.forRoot({
      // Em produção (Electron), o frontend está em extraResources -> Resources/frontend/dist
      // Em desenvolvimento, está na pasta frontend do monorepo
      rootPath: process.env.NODE_ENV === 'production'
        ? join(process.env.APP_PATH || '', '..', 'frontend', 'dist')
        : join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)'],
    }),
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
