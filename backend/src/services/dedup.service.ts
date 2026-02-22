import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { ParsedTransaction } from './parsers/c6.parser';

export interface DedupResult {
  newTransactions: ParsedTransaction[];
  duplicateCount: number;
}

@Injectable()
export class DedupService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async deduplicate(transactions: ParsedTransaction[]): Promise<DedupResult> {
    if (transactions.length === 0) {
      return { newTransactions: [], duplicateCount: 0 };
    }

    const ids = transactions.map((t) => t.id);

    // Check in batches of 500 (SQLite parameter limit)
    const existingIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const existing = await this.txRepo.find({
        select: ['id'],
        where: { id: In(batch) },
      });
      existing.forEach((e) => existingIds.add(e.id));
    }

    const newTransactions = transactions.filter((t) => !existingIds.has(t.id));
    const duplicateCount = transactions.length - newTransactions.length;

    return { newTransactions, duplicateCount };
  }
}
