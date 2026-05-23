import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DedupService } from '../src/services/dedup.service';
import { Transaction } from '../src/entities/transaction.entity';
import { ParsedTransaction } from '../src/services/parsers/parser.registry';

describe('DedupService', () => {
  let service: DedupService;
  let txRepoMock: any;

  beforeEach(async () => {
    txRepoMock = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DedupService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: txRepoMock,
        },
      ],
    }).compile();

    service = module.get<DedupService>(DedupService);
  });

  it('deve retornar todas as transacoes se nenhuma ja existir', async () => {
    txRepoMock.find.mockResolvedValue([]);

    const txs: ParsedTransaction[] = [
      { id: '1', data: '2026-05-01', titulo: 'A', descricao: '', valor: 10, banco: 'C6', account_type: 'CHECKING' },
      { id: '2', data: '2026-05-02', titulo: 'B', descricao: '', valor: 20, banco: 'C6', account_type: 'CHECKING' },
    ];

    const result = await service.deduplicate(txs);

    expect(result.newTransactions).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
    expect(txRepoMock.find).toHaveBeenCalled();
  });

  it('deve filtrar transacoes duplicadas', async () => {
    // Simula que a transação de ID '1' já existe no banco
    txRepoMock.find.mockResolvedValue([{ id: '1' }]);

    const txs: ParsedTransaction[] = [
      { id: '1', data: '2026-05-01', titulo: 'A', descricao: '', valor: 10, banco: 'C6', account_type: 'CHECKING' },
      { id: '2', data: '2026-05-02', titulo: 'B', descricao: '', valor: 20, banco: 'C6', account_type: 'CHECKING' },
    ];

    const result = await service.deduplicate(txs);

    expect(result.newTransactions).toHaveLength(1);
    expect(result.newTransactions[0].id).toBe('2');
    expect(result.duplicateCount).toBe(1);
  });

  it('deve retornar vazio se a lista de transacoes for vazia', async () => {
    const result = await service.deduplicate([]);
    expect(result.newTransactions).toHaveLength(0);
    expect(result.duplicateCount).toBe(0);
  });
});
