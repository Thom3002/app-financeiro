import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluggyController } from './pluggy.controller';
import { PluggyService } from './pluggy.service';
import { Transaction } from '../entities/transaction.entity';
import { PluggyItem } from '../entities/pluggy-item.entity';
import { Category } from '../entities/category.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Setting } from '../entities/setting.entity';
import { ClassifierService } from '../services/classifier.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      PluggyItem,
      Category,
      ClassificationRule,
      Setting,
    ]),
  ],
  controllers: [PluggyController],
  providers: [PluggyService, ClassifierService],
  exports: [PluggyService],
})
export class PluggyModule {}
