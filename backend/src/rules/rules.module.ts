import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassifierService } from '../services/classifier.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClassificationRule, Transaction]), CategoriesModule],
  controllers: [RulesController],
  providers: [RulesService, ClassifierService],
})
export class RulesModule {}
