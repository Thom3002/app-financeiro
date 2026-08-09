import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';
import { CategoriesModule } from '../categories/categories.module';
import { ClassifierModule } from '../services/classifier.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClassificationRule, Transaction]),
    CategoriesModule,
    ClassifierModule,
  ],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
