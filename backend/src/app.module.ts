import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
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

function getFrontendDistPath(): string {
  let resolvedPath = '';

  // 1. Electron packaged path (production)
  if (process.env.APP_PATH) {
    resolvedPath = join(process.env.APP_PATH, '..', 'frontend', 'dist');
  } else {
    // 2. Standalone server production and dev fallback paths relative to this file (__dirname)
    const relativeToSrc = join(__dirname, '..', '..', 'frontend', 'dist');
    const relativeToDistSrc = join(__dirname, '..', '..', '..', 'frontend', 'dist');

    if (existsSync(join(relativeToDistSrc, 'index.html'))) {
      resolvedPath = relativeToDistSrc;
    } else if (existsSync(join(relativeToSrc, 'index.html'))) {
      resolvedPath = relativeToSrc;
    } else if (process.cwd() && process.cwd() !== '/' && existsSync(join(process.cwd(), '..', 'frontend', 'dist', 'index.html'))) {
      // 3. Fallback using process.cwd()
      resolvedPath = join(process.cwd(), '..', 'frontend', 'dist');
    } else {
      // 4. Default fallback
      resolvedPath = relativeToSrc;
    }
  }

  console.log(`[StaticServe] Resolved frontend path: ${resolvedPath} (exists: ${existsSync(join(resolvedPath, 'index.html'))})`);
  return resolvedPath;
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
