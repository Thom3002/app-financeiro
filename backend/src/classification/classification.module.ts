import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './classification.service';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { ClassifierService } from '../services/classifier.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, ClassificationRule]), CategoriesModule],
  controllers: [ClassificationController],
  providers: [ClassificationService, ClassifierService],
})
export class ClassificationModule {}
