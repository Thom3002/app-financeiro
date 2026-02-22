import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ImportLog } from '../entities/import-log.entity';
import { DedupService } from '../services/dedup.service';
import { ClassifierService } from '../services/classifier.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ClassificationRule, ImportLog]),
  ],
  controllers: [ImportController],
  providers: [ImportService, DedupService, ClassifierService],
})
export class ImportModule {}
