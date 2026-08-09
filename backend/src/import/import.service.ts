import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { ImportLog } from '../entities/import-log.entity';
import { DedupService } from '../services/dedup.service';
import { ClassifierService } from '../services/classifier.service';
import {
  parseCSV,
  getSupportedBanks,
} from '../services/parsers/parser.registry';

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(ImportLog)
    private readonly logRepo: Repository<ImportLog>,
    private readonly dedupService: DedupService,
    private readonly classifierService: ClassifierService,
  ) {}

  getBanks() {
    return getSupportedBanks();
  }

  preview(banco: string, csvContent: string) {
    const result = parseCSV(banco, csvContent);
    return {
      transactions: result.transactions.slice(0, 20),
      totalParsed: result.transactions.length,
      errors: result.errors,
    };
  }

  async execute(banco: string, csvContent: string, filename: string) {
    // 1. Parse
    const parsed = parseCSV(banco, csvContent);
    if (parsed.errors.length > 0 && parsed.transactions.length === 0) {
      return {
        success: false,
        errors: parsed.errors,
        log: null,
      };
    }

    // 2. Deduplicate
    const { newTransactions, duplicateCount } =
      await this.dedupService.deduplicate(parsed.transactions);

    // 3. Classify
    const rules = await this.classifierService.loadRules();
    const classifiedTransactions: Transaction[] = newTransactions.map((t) => {
      const classification = this.classifierService.classifyTransaction(
        t,
        rules,
      );
      const tx = new Transaction();
      tx.id = t.id;
      tx.data = t.data;
      tx.titulo = t.titulo;
      tx.descricao = t.descricao;
      tx.valor = t.valor;
      tx.banco = t.banco;
      tx.account_type = t.account_type;
      tx.categoria = classification.categoria;
      tx.subcategoria = classification.subcategoria;
      tx.matched_rule_id = classification.matched_rule_id;
      tx.is_manual = false;
      return tx;
    });

    // 4. Batch Insert in chunks of 100 to execute quickly and prevent database/event loop freezing
    for (let i = 0; i < classifiedTransactions.length; i += 100) {
      const chunk = classifiedTransactions.slice(i, i + 100);
      try {
        await this.txRepo
          .createQueryBuilder()
          .insert()
          .into(Transaction)
          .values(chunk)
          .orIgnore()
          .execute();
      } catch {
        for (const tx of chunk) {
          try {
            await this.txRepo
              .createQueryBuilder()
              .insert()
              .into(Transaction)
              .values(tx)
              .orIgnore()
              .execute();
          } catch {
            // Skip failed row
          }
        }
      }
    }

    // 5. Create import log
    const log = this.logRepo.create({
      banco,
      filename,
      total: parsed.transactions.length,
      novas: newTransactions.length,
      duplicadas: duplicateCount,
      invalidas: parsed.errors.length,
    });
    await this.logRepo.save(log);

    // Update import_id on new transactions in chunks of 100 with unique IDs
    if (classifiedTransactions.length > 0) {
      const uniqueIds = Array.from(
        new Set(classifiedTransactions.map((t) => t.id)),
      );
      for (let i = 0; i < uniqueIds.length; i += 100) {
        const idBatch = uniqueIds.slice(i, i + 100);
        try {
          await this.txRepo
            .createQueryBuilder()
            .update(Transaction)
            .set({ import_id: log.id })
            .whereInIds(idBatch)
            .execute();
        } catch {}
      }
    }

    return {
      success: true,
      errors: parsed.errors,
      log,
    };
  }

  async getImports() {
    return this.logRepo.find({ order: { created_at: 'DESC' } });
  }

  async deleteImport(importId: string) {
    // 1. Delete all transactions belonging to this import
    await this.txRepo.delete({ import_id: importId });

    // 2. Delete the import log record itself
    await this.logRepo.delete({ id: importId });

    return { success: true };
  }
}
