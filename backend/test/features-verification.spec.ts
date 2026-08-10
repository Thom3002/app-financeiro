import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Transaction } from '../src/entities/transaction.entity';
import { ClassificationRule } from '../src/entities/classification-rule.entity';
import { Category } from '../src/entities/category.entity';
import { ImportLog } from '../src/entities/import-log.entity';
import { PluggyItem } from '../src/entities/pluggy-item.entity';
import { Setting } from '../src/entities/setting.entity';
import { RulesService } from '../src/rules/rules.service';
import { ClassifierService } from '../src/services/classifier.service';
import { CategoriesService } from '../src/categories/categories.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { ImportService } from '../src/import/import.service';
import { DedupService } from '../src/services/dedup.service';

describe('Suíte de Verificação das Últimas 3 Versões (Integridade e Regras)', () => {
  let rulesService: RulesService;
  let classifierService: ClassifierService;
  let transactionsService: TransactionsService;
  let importService: ImportService;

  let txStore: Transaction[] = [];
  let ruleStore: ClassificationRule[] = [];
  let catStore: Category[] = [];
  let logStore: ImportLog[] = [];
  let itemStore: PluggyItem[] = [];
  let settingStore: Setting[] = [];

  let mockTxRepo: any;
  let mockRuleRepo: any;
  let mockCatRepo: any;
  let mockLogRepo: any;
  let mockItemRepo: any;
  let mockSettingRepo: any;

  beforeEach(async () => {
    txStore = [];
    ruleStore = [];
    catStore = [];
    logStore = [];
    itemStore = [];
    settingStore = [];

    mockTxRepo = {
      find: jest.fn(async (opts?: any) => {
        let result = [...txStore];
        if (opts?.where?.id) {
          if (typeof opts.where.id === 'object' && opts.where.id.In) {
            result = result.filter((t) => opts.where.id.In.includes(t.id));
          } else {
            result = result.filter((t) => t.id === opts.where.id);
          }
        }
        return result;
      }),
      findOne: jest.fn(async (opts?: any) => {
        if (opts?.where?.id) return txStore.find((t) => t.id === opts.where.id) || null;
        if (opts?.where?.regex) return txStore.find((t) => (t as any).regex === opts.where.regex) || null;
        return null;
      }),
      findOneBy: jest.fn(async (opts: any) => txStore.find((t) => t.id === opts.id) || null),
      save: jest.fn(async (entity: any) => {
        if (Array.isArray(entity)) {
          entity.forEach((e) => {
            const idx = txStore.findIndex((t) => t.id === e.id);
            if (idx >= 0) txStore[idx] = e;
            else txStore.push(e);
          });
          return entity;
        }
        const idx = txStore.findIndex((t) => t.id === entity.id);
        if (idx >= 0) txStore[idx] = entity;
        else txStore.push(entity);
        return entity;
      }),
      create: jest.fn((dto: any) => ({ ...new Transaction(), ...dto })),
      clear: jest.fn(async () => {
        txStore = [];
      }),
      count: jest.fn(async (opts?: any) => {
        if (opts?.where?.matched_rule_id) {
          return txStore.filter((t) => t.matched_rule_id === opts.where.matched_rule_id).length;
        }
        return txStore.length;
      }),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockImplementation((val: any) => {
          const vals = Array.isArray(val) ? val : [val];
          vals.forEach((v) => {
            if (!txStore.some((t) => t.id === v.id)) txStore.push(v);
          });
          return {
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          };
        }),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };

    mockRuleRepo = {
      find: jest.fn(async (opts?: any) => {
        let rules = [...ruleStore];
        if (opts?.where?.enabled) rules = rules.filter((r) => r.enabled);
        if (opts?.order?.priority === 'ASC') rules.sort((a, b) => a.priority - b.priority);
        return rules;
      }),
      findOne: jest.fn(async (opts?: any) => {
        if (opts?.where?.regex) return ruleStore.find((r) => r.regex === opts.where.regex) || null;
        if (opts?.where?.id) return ruleStore.find((r) => r.id === opts.where.id) || null;
        return null;
      }),
      findOneBy: jest.fn(async (opts: any) => ruleStore.find((r) => r.id === opts.id) || null),
      create: jest.fn((dto: any) => {
        const r = { id: `rule-${Date.now()}-${Math.random()}`, priority: 100, enabled: true, ...dto };
        return r;
      }),
      save: jest.fn(async (entity: any) => {
        const idx = ruleStore.findIndex((r) => r.id === entity.id);
        if (idx >= 0) ruleStore[idx] = entity;
        else ruleStore.push(entity);
        return entity;
      }),
      update: jest.fn(async (id: string, dto: any) => {
        const r = ruleStore.find((item) => item.id === id);
        if (r) Object.assign(r, dto);
      }),
      remove: jest.fn(async (entity: any) => {
        ruleStore = ruleStore.filter((r) => r.id !== entity.id);
      }),
      clear: jest.fn(async () => {
        ruleStore = [];
      }),
      createQueryBuilder: jest.fn(() => ({
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      })),
    };

    mockCatRepo = {
      find: jest.fn(async () => catStore),
      findOne: jest.fn(async (opts: any) => {
        if (opts?.where?.nome) return catStore.find((c) => c.nome === opts.where.nome) || null;
        return null;
      }),
      findOneBy: jest.fn(async (opts: any) => catStore.find((c) => c.id === opts.id) || null),
      create: jest.fn((dto: any) => ({ id: `cat-${Date.now()}`, ...dto })),
      save: jest.fn(async (entity: any) => {
        catStore.push(entity);
        return entity;
      }),
      clear: jest.fn(async () => {
        catStore = [];
      }),
    };

    mockLogRepo = {
      create: jest.fn((dto: any) => ({ id: `log-${Date.now()}`, ...dto })),
      save: jest.fn(async (entity: any) => {
        logStore.push(entity);
        return entity;
      }),
      clear: jest.fn(async () => {
        logStore = [];
      }),
      find: jest.fn(async () => logStore),
    };

    mockItemRepo = {
      clear: jest.fn(async () => {
        itemStore = [];
      }),
      find: jest.fn(async () => itemStore),
    };

    mockSettingRepo = {
      clear: jest.fn(async () => {
        settingStore = [];
      }),
      findOneBy: jest.fn(async () => null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RulesService,
        ClassifierService,
        CategoriesService,
        TransactionsService,
        ImportService,
        DedupService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
        { provide: getRepositoryToken(ClassificationRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(Category), useValue: mockCatRepo },
        { provide: getRepositoryToken(ImportLog), useValue: mockLogRepo },
        { provide: getRepositoryToken(PluggyItem), useValue: mockItemRepo },
        { provide: getRepositoryToken(Setting), useValue: mockSettingRepo },
      ],
    }).compile();

    rulesService = module.get<RulesService>(RulesService);
    classifierService = module.get<ClassifierService>(ClassifierService);
    transactionsService = module.get<TransactionsService>(TransactionsService);
    importService = module.get<ImportService>(ImportService);
  });

  describe('1. Regra de Preservação de Classificação Manual (is_manual)', () => {
    it('NÃO deve reclassificar transação marcada como is_manual=true durante reclassifyAll()', async () => {
      // 1. Criar regra automatizada
      await rulesService.create({
        regex: 'uber',
        categoria: 'Transporte',
      });

      // 2. Inserir transação manual com outra categoria
      const txManual = new Transaction();
      txManual.id = 'tx-manual-1';
      txManual.data = '2026-08-01';
      txManual.titulo = 'Uber trip 123';
      txManual.descricao = 'Uber trip 123';
      txManual.valor = -25.5;
      txManual.banco = 'C6 Bank';
      txManual.categoria = 'Alimentação';
      txManual.is_manual = true;
      txStore.push(txManual);

      // 3. Inserir transação automática
      const txAuto = new Transaction();
      txAuto.id = 'tx-auto-1';
      txAuto.data = '2026-08-01';
      txAuto.titulo = 'Uber trip 456';
      txAuto.descricao = 'Uber trip 456';
      txAuto.valor = -30.0;
      txAuto.banco = 'C6 Bank';
      txAuto.categoria = 'Não classificado';
      txAuto.is_manual = false;
      txStore.push(txAuto);

      // 4. Executar reclassificação global
      await classifierService.reclassifyAll();

      // 5. Verificar que a transação manual NÃO mudou
      const resManual = txStore.find((t) => t.id === 'tx-manual-1');
      expect(resManual?.categoria).toBe('Alimentação');
      expect(resManual?.is_manual).toBe(true);

      // 6. Verificar que a transação automática MUDOU para Transporte
      const resAuto = txStore.find((t) => t.id === 'tx-auto-1');
      expect(resAuto?.categoria).toBe('Transporte');
      expect(resAuto?.is_manual).toBe(false);
    });

    it('Deve permitir reclassificação caso a categoria manual seja removida ("Não classificado")', async () => {
      await rulesService.create({
        regex: 'netflix',
        categoria: 'Lazer',
      });

      const tx = new Transaction();
      tx.id = 'tx-netflix';
      tx.data = '2026-08-01';
      tx.titulo = 'Netflix Signature';
      tx.descricao = 'Netflix Signature';
      tx.valor = -55.9;
      tx.banco = 'Bradesco';
      tx.categoria = 'Outros';
      tx.is_manual = true;
      txStore.push(tx);

      // Alterar manualmente para "Não classificado"
      await transactionsService.updateCategory(tx.id, { categoria: 'Não classificado' });

      const updatedTx = txStore.find((t) => t.id === tx.id);
      expect(updatedTx?.is_manual).toBe(false);

      // Reclassificar
      await classifierService.reclassifyAll();
      const finalTx = txStore.find((t) => t.id === tx.id);
      expect(finalTx?.categoria).toBe('Lazer');
    });
  });

  describe('2. Validação e Unicidade de Regexes', () => {
    it('Deve rejeitar a criação de regras com regex duplicado', async () => {
      await rulesService.create({
        regex: 'supermercado.*',
        categoria: 'Mercado',
      });

      await expect(
        rulesService.create({
          regex: 'supermercado.*',
          categoria: 'Outra Categoria',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('Deve rejeitar criação ou atualização de regra com categoria "Não classificado" ou vazia', async () => {
      await expect(
        rulesService.create({
          regex: 'qualquer',
          categoria: 'Não classificado',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        rulesService.create({
          regex: 'qualquer',
          categoria: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Não deve duplicar regexes durante importação em lote (importRules)', async () => {
      await rulesService.create({
        regex: 'iFood.*',
        categoria: 'Alimentação',
      });

      const result = await rulesService.importRules([
        { regex: 'iFood.*', categoria: 'Alimentação / Delivery' },
        { regex: '  iFood.*  ', categoria: 'Delivery' },
        { regex: 'restaurante', categoria: 'Não classificado' },
        { regex: 'cinema', categoria: 'Lazer' },
      ]);

      expect(result.imported).toBe(3); // 2 atualizações + 1 novo
      expect(result.errors.length).toBe(1); // restaurante ignorado por categoria inválida

      const ifoodRules = ruleStore.filter((r) => r.regex.toLowerCase().includes('ifood'));
      expect(ifoodRules.length).toBe(1);
      expect(ifoodRules[0].categoria).toBe('Delivery');
    });
  });

  describe('3. Propagação de Custo Fixo e Ignorar Dashboard', () => {
    it('Deve propagar set_custo_fixo e ignorar_dashboard ao importar CSV', async () => {
      await rulesService.create({
        regex: 'spotify',
        categoria: 'Assinaturas',
        set_custo_fixo: true,
        ignorar_dashboard: true,
      });

      const csvData = `Extrato de: Ag: 2389 | Conta: 116715-4 | Entre 01/03/2026 e 31/03/2026
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);
02/03/26; Spotify Premium;2760061;;"-34,90";
`;

      const importRes = await importService.execute('Bradesco', csvData, 'extrato.csv');
      expect(importRes.success).toBe(true);

      expect(txStore.length).toBe(1);
      expect(txStore[0].categoria).toBe('Assinaturas');
      expect(txStore[0].is_custo_fixo).toBe(true);
      expect(txStore[0].ignorar_dashboard).toBe(true);
      expect(txStore[0].ignore_reason).toContain('Regra de classificação');
    });
  });

  describe('4. Reset do Aplicativo', () => {
    it('Deve realizar o reset de transações sem apagar regras nem categorias', async () => {
      await rulesService.create({ regex: 'teste', categoria: 'Geral' });
      const tx = new Transaction();
      tx.id = 'tx-reset';
      tx.data = '2026-08-01';
      tx.titulo = 'teste';
      tx.descricao = 'teste';
      tx.valor = -10;
      tx.banco = 'C6 Bank';
      txStore.push(tx);

      await transactionsService.resetApp('transactions');

      expect(txStore.length).toBe(0);
      expect(ruleStore.length).toBe(1);
    });

    it('Deve realizar o reset completo (full) apagando regras e categorias', async () => {
      await rulesService.create({ regex: 'teste', categoria: 'Geral' });
      const tx = new Transaction();
      tx.id = 'tx-reset-full';
      tx.data = '2026-08-01';
      tx.titulo = 'teste';
      tx.descricao = 'teste';
      tx.valor = -10;
      tx.banco = 'C6 Bank';
      txStore.push(tx);

      await transactionsService.resetApp('full');

      expect(txStore.length).toBe(0);
      expect(ruleStore.length).toBe(0);
      expect(catStore.length).toBe(0);
    });
  });
});
