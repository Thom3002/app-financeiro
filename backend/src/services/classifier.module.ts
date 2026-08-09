import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassifierService } from './classifier.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClassificationRule, Transaction])],
  providers: [ClassifierService],
  exports: [ClassifierService],
})
export class ClassifierModule {}
