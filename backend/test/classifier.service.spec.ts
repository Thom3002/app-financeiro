import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClassifierService } from '../src/services/classifier.service';
import { ClassificationRule } from '../src/entities/classification-rule.entity';
import { Transaction } from '../src/entities/transaction.entity';

describe('ClassifierService', () => {
  let service: ClassifierService;
  let ruleRepoMock: any;
  let txRepoMock: any;

  beforeEach(async () => {
    ruleRepoMock = {
      find: jest.fn(),
    };
    txRepoMock = {
      find: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierService,
        {
          provide: getRepositoryToken(ClassificationRule),
          useValue: ruleRepoMock,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: txRepoMock,
        },
      ],
    }).compile();

    service = module.get<ClassifierService>(ClassifierService);
  });

  describe('classifyTransaction', () => {
    it('deve classificar baseado na regra de título com match', () => {
      const mockRule = {
        id: 'rule-1',
        regex: 'uber',
        campo_alvo: 'titulo',
        banco_escopo: 'qualquer',
        sinal_escopo: 'ambos',
        categoria: 'Transporte',
        subcategoria: 'Uber',
        enabled: true,
        priority: 1,
      } as ClassificationRule;

      const tx = { titulo: 'Uber *Trip Help', descricao: '', valor: -15.5, banco: 'C6' };
      const result = service.classifyTransaction(tx, [mockRule]);

      expect(result.categoria).toBe('Transporte');
      expect(result.subcategoria).toBe('Uber');
      expect(result.matched_rule_id).toBe('rule-1');
    });

    it('deve respeitar o escopo do banco', () => {
      const mockRule = {
        id: 'rule-1',
        regex: 'uber',
        campo_alvo: 'titulo',
        banco_escopo: 'C6',
        sinal_escopo: 'ambos',
        categoria: 'Transporte',
        subcategoria: 'Uber',
        enabled: true,
        priority: 1,
      } as ClassificationRule;

      const txC6 = { titulo: 'Uber *Trip', descricao: '', valor: -15.5, banco: 'C6' };
      const txBradesco = { titulo: 'Uber *Trip', descricao: '', valor: -15.5, banco: 'BRADESCO' };

      const resC6 = service.classifyTransaction(txC6, [mockRule]);
      const resBradesco = service.classifyTransaction(txBradesco, [mockRule]);

      expect(resC6.categoria).toBe('Transporte');
      expect(resBradesco.categoria).toBe('Não classificado');
    });

    it('deve respeitar o sinal da transacao (entrada/saida)', () => {
      const mockRuleSaida = {
        id: 'rule-1',
        regex: 'reembolso',
        campo_alvo: 'titulo',
        banco_escopo: 'qualquer',
        sinal_escopo: 'entrada',
        categoria: 'Reembolso',
        subcategoria: null,
        enabled: true,
        priority: 1,
      } as ClassificationRule;

      const txSaida = { titulo: 'Reembolso loja', descricao: '', valor: -50, banco: 'C6' }; // despesa (negativo)
      const txEntrada = { titulo: 'Reembolso loja', descricao: '', valor: 50, banco: 'C6' }; // receita (positivo)

      const resSaida = service.classifyTransaction(txSaida, [mockRuleSaida]);
      const resEntrada = service.classifyTransaction(txEntrada, [mockRuleSaida]);

      expect(resSaida.categoria).toBe('Não classificado');
      expect(resEntrada.categoria).toBe('Reembolso');
    });
  });

  describe('keywordsToRegex', () => {
    it('deve converter palavras-chave separadas por virgula em um padrao regex', () => {
      const regexStr = service.keywordsToRegex('uber, 99 pop, taxi');
      expect(regexStr).toBe('(?:uber|99\\s*pop|taxi)');
    });

    it('deve retornar string vazia se nao houver palavras-chave', () => {
      expect(service.keywordsToRegex('')).toBe('');
      expect(service.keywordsToRegex(',,,')).toBe('');
    });

    it('deve escapar caracteres especiais do regex', () => {
      expect(service.keywordsToRegex('ifd*br')).toBe('ifd\\*br');
    });
  });

  describe('testRule', () => {
    it('deve testar regex contra texto corretamente', () => {
      const res = service.testRule('^uber', 'Uber Trip');
      expect(res.matches).toBe(true);
    });

    it('deve retornar erro se regex for invalido', () => {
      const res = service.testRule('[invalid', 'text');
      expect(res.matches).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('detectConflicts', () => {
    it('deve detectar conflitos entre novas e velhas regras', async () => {
      const mockRule = {
        id: 'rule-old',
        regex: 'netflix',
        categoria: 'Entretenimento',
        enabled: true,
      } as ClassificationRule;

      const mockTx = {
        id: 'tx-1',
        titulo: 'NETFLIX.COM',
        descricao: '',
        valor: -44.9,
      } as Transaction;

      ruleRepoMock.find.mockResolvedValue([mockRule]);
      txRepoMock.find.mockResolvedValue([mockTx]);

      const result = await service.detectConflicts('netflix');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].rule.id).toBe('rule-old');
      expect(result.conflicts[0].overlapCount).toBe(1);
    });
  });
});
