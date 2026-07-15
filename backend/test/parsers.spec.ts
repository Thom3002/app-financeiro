import { parseBradescoCsv } from '../src/services/parsers/bradesco.parser';
import { parseC6Csv } from '../src/services/parsers/c6.parser';

describe('C6 Bank Parser', () => {
  const mockC6Csv = `Data Lançamento,Titulo,Descrição,Entrada (R$),Saída (R$)
19/04/2026,Compra IFD*BR,Alimentacao,,106.44
20/04/2026,Pix Recebido,De João,150.00,
`;

  it('deve parsear corretamente o extrato C6', () => {
    const result = parseC6Csv(mockC6Csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(2);

    // Compra (Saída)
    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        data: '2026-04-19',
        titulo: 'Compra IFD*BR',
        descricao: 'Alimentacao',
        valor: -106.44,
        banco: 'C6',
        account_type: 'CHECKING',
      })
    );

    // Pix (Entrada)
    expect(result.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-04-20',
        titulo: 'Pix Recebido',
        descricao: 'De João',
        valor: 150.00,
        banco: 'C6',
        account_type: 'CHECKING',
      })
    );
  });
});

describe('Bradesco Parser - Conta Corrente', () => {
  const mockBradescoCheckingCsv = `Extrato de: Ag: 2389 | Conta: 116715-4 | Entre 01/03/2026 e 31/03/2026
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);
27/02/26;SALDO ANTERIOR;;;;"1,00";
02/03/26; Resg/vencto Cdb;0582389;"5.259,87";;"5.260,87";
02/03/26; Seg Mais Prot;2760061;;"-2,86";
02/03/26; Transfe Pix;0620330;;"-4.022,58";
;Des: Alesandra Misse Rosa 01/03;;
30/03/26; Pix Qrcode Est;1408493;;"-189,99";
;Total;;"105.355,85";"-95.803,07";"9.553,78"
`;

  it('deve parsear extrato de conta corrente identificando o tipo automaticamente', () => {
    const result = parseBradescoCsv(mockBradescoCheckingCsv);
    expect(result.errors).toHaveLength(0);
    // Deve ignorar SALDO ANTERIOR e Total. Total de transações válidas:
    // 1. Resg/vencto Cdb (5259.87)
    // 2. Seg Mais Prot (-2.86)
    // 3. Transfe Pix (-4022.58)
    // 4. Pix Qrcode Est (-189.99)
    expect(result.transactions).toHaveLength(4);

    // Validação de crédito e formatação numérica com milhar
    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        data: '2026-03-02',
        titulo: 'Resg/vencto Cdb',
        descricao: '',
        valor: 5259.87,
        banco: 'BRADESCO',
        account_type: 'CHECKING',
      })
    );

    // Validação de débito simples
    expect(result.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-03-02',
        titulo: 'Seg Mais Prot',
        valor: -2.86,
        account_type: 'CHECKING',
      })
    );

    // Validação de acumulação de detalhes da linha sem data
    expect(result.transactions[2]).toEqual(
      expect.objectContaining({
        data: '2026-03-02',
        titulo: 'Transfe Pix',
        descricao: 'Des: Alesandra Misse Rosa 01/03',
        valor: -4022.58,
        account_type: 'CHECKING',
      })
    );

    // Validação de outra despesa
    expect(result.transactions[3]).toEqual(
      expect.objectContaining({
        data: '2026-03-30',
        titulo: 'Pix Qrcode Est',
        valor: -189.99,
        account_type: 'CHECKING',
      })
    );
  });

  it('deve parsear extrato de conta corrente com ano em 4 dígitos (YYYY)', () => {
    const mockBradescoChecking4DigitYearCsv = `Extrato de: Ag: 2389 | Conta: 116715-4
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
02/01/2026;TRANSF.AUTORIZ.ENTRE C/C;2389132;6.163,19; ;33.685,56
02/01/2026;SEGURO MAIS PROTECAO;2760002; ;2,86;33.682,70
`;
    const result = parseBradescoCsv(mockBradescoChecking4DigitYearCsv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        data: '2026-01-02',
        titulo: 'TRANSF.AUTORIZ.ENTRE C/C',
        valor: 6163.19,
        account_type: 'CHECKING',
      })
    );
    expect(result.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-01-02',
        titulo: 'SEGURO MAIS PROTECAO',
        valor: -2.86,
        account_type: 'CHECKING',
      })
    );
  });
});

describe('Bradesco Parser - Cartão de Crédito', () => {
  const mockBradescoCreditCardCsv = `Data: 23/05/2026 02:52:07

Situação da Fatura: PAGO

MAEVE B MELLO ;;; 4961
Data;Histórico;Valor(US$);Valor(R$);
19/04;IFD*BR ;0,00;106,44
19/04;IFD*BR ;0,00;2,00
01/04;IFD*BR ;0,00;-25,17
27/03;PAGTO ANTECIPADO PIX ;0,00;-18319,01
16/12;POLOARSTR 5/10;0,00;494,28

MAEVE B MELLO ;;; 4487
Data;Histórico;Valor(US$);Valor(R$);
16/04;ALLIANZ SEGU*03 d ;0,00;74,70
`;

  it('deve parsear extrato de cartão de crédito identificando o tipo automaticamente', () => {
    const result = parseBradescoCsv(mockBradescoCreditCardCsv);
    expect(result.errors).toHaveLength(0);
    // Deve parsear de ambos os cartões (4961 e 4487)
    expect(result.transactions).toHaveLength(6);

    // Compra simples (deve ser convertida para negativo)
    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        data: '2026-04-19',
        titulo: 'IFD*BR',
        descricao: 'MAEVE B MELLO (Final 4961)',
        valor: -106.44,
        banco: 'BRADESCO',
        account_type: 'CREDIT_CARD',
      })
    );

    // Estorno / Devolução (era negativo no CSV, deve ficar positivo no banco)
    expect(result.transactions[2]).toEqual(
      expect.objectContaining({
        data: '2026-04-01',
        titulo: 'IFD*BR',
        valor: 25.17,
      })
    );

    // Pagamento da fatura (era negativo no CSV, deve ficar positivo no banco)
    expect(result.transactions[3]).toEqual(
      expect.objectContaining({
        data: '2026-03-27',
        titulo: 'PAGTO ANTECIPADO PIX',
        valor: 18319.01,
      })
    );

    // Transação de Dezembro em uma fatura de Maio de 2026 (Ano recalculado para 2025)
    expect(result.transactions[4]).toEqual(
      expect.objectContaining({
        data: '2025-12-16',
        titulo: 'POLOARSTR 5/10',
        valor: -494.28,
      })
    );

    // Transação do outro cartão
    expect(result.transactions[5]).toEqual(
      expect.objectContaining({
        data: '2026-04-16',
        titulo: 'ALLIANZ SEGU*03 d',
        descricao: 'MAEVE B MELLO (Final 4487)',
        valor: -74.70,
        banco: 'BRADESCO',
        account_type: 'CREDIT_CARD',
      })
    );
  });
});
