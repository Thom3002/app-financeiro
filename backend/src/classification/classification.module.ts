import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './classification.service';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';
import { CategoriesModule } from '../categories/categories.module';
import { ClassifierModule } from '../services/classifier.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ClassificationRule]),
    CategoriesModule,
    ClassifierModule,
  ],
  controllers: [ClassificationController],
  providers: [ClassificationService],
})
export class ClassificationModule {}
