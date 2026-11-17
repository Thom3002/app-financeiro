import * as fs from 'fs';
import * as path from 'path';
import { parseBradescoCsv } from '../src/services/parsers/bradesco.parser';
import { parseC6Csv } from '../src/services/parsers/c6.parser';
import { parseBBCsv } from '../src/services/parsers/bb.parser';
import { parseCSV, getSupportedBanks } from '../src/services/parsers/parser.registry';
import { isPdfBuffer, extractPdfText } from '../src/services/parsers/pdf.extractor';

function readLatin1OrUtf8(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buf);
  } catch {
    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(buf);
  }
}

describe('Parser Registry', () => {
  it('deve listar C6, BRADESCO e BB como bancos suportados', () => {
    const banks = getSupportedBanks();
    const ids = banks.map((b) => b.id);
    expect(ids).toContain('C6');
    expect(ids).toContain('BRADESCO');
    expect(ids).toContain('BB');
  });
});

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
    expect(result.transactions).toHaveLength(4);

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

    expect(result.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-03-02',
        titulo: 'Seg Mais Prot',
        valor: -2.86,
        account_type: 'CHECKING',
      })
    );

    expect(result.transactions[2]).toEqual(
      expect.objectContaining({
        data: '2026-03-02',
        titulo: 'Transfe Pix',
        descricao: 'Des: Alesandra Misse Rosa 01/03',
        valor: -4022.58,
        account_type: 'CHECKING',
      })
    );

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

  it('deve ignorar linhas de Total do Dia e interromper antes de Lançamentos Futuros', () => {
    const mockWithFuture = `Extrato de: Ag: 2389 | Conta: 107563-2
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);
24/07/26;SALDO ANTERIOR;;;;"38.828,27";
27/07/26; Transf Autoriz;0416078;;"-1.300,00";"37.528,27";
;Luiz Fernando Elias;;
;Total do Dia;;;"-1.300,00"
20/10/26; Brad Vida Prev;0000120;"19.883,46";;"21.077,20";
;Aposent Tpo Contrib 10 / 2026;;
;Total;;"116.455,25";"-139.506,32";"15.777,20"
Os dados acima têm como base 23/10/2026 às 14h26 e estão sujeitos a alterações.

Lançamentos Futuros
Data;Histórico;Docto.;Crédito (R$);Débito (R$);
01/11/26; Pix Enviado;1459534;;"-7.915,20";
;Dest: Maeve Brito de Mello;;
`;
    const result = parseBradescoCsv(mockWithFuture);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].descricao).toBe('Luiz Fernando Elias');
    expect(result.transactions[1].descricao).toBe('Aposent Tpo Contrib 10 / 2026');
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
    expect(result.transactions).toHaveLength(6);

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

    expect(result.transactions[2]).toEqual(
      expect.objectContaining({
        data: '2026-04-01',
        titulo: 'IFD*BR',
        valor: 25.17,
      })
    );

    expect(result.transactions[3]).toEqual(
      expect.objectContaining({
        data: '2026-03-27',
        titulo: 'PAGTO ANTECIPADO PIX',
        valor: 18319.01,
        ignorar_dashboard: true,
      })
    );

    expect(result.transactions[4]).toEqual(
      expect.objectContaining({
        data: '2025-12-16',
        titulo: 'POLOARSTR 5/10',
        valor: -494.28,
        parcela_atual: 5,
        total_parcelas: 10,
      })
    );

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

describe('Banco do Brasil Parser - Conta Corrente (Layouts v1 e v2)', () => {
  const mockBBLayoutV1 = `"Data","Dependencia Origem","Histórico","Data do Balancete","Número do documento","Valor",
"31/07/2026","","Saldo Anterior","","0","0.00",
"03/08/2026","","Cobrança de I.O.F. - IOF Saldo Devedor Conta","","391100701","-9.45",
"03/08/2026","","BB Rende Fácil - Rende Facil","","9903","9.45",
"05/08/2026","","Pix - Recebido - 05/08 13:51 00033635623814 AMANDA TONI","","51351313071502","800.00",
"07/08/2026","","Recebimento de Proventos - 09.041.213/0001-36 SAO PAULO PREVIDENC","","406722","8379.67",
"17/08/2026","","Pix Agendado - 15/08 GUILHERME JOIA BARCELOS  003/007","","81701","-1537.50",
"24/08/2026","","S A L D O","","0","-3028.60",
`;

  const mockBBLayoutV2 = `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
"31/07/2026","Saldo Anterior","","","0,00",""
"03/08/2026","Cobrança de I.O.F.","IOF Saldo Devedor Conta","391100701","-9,45","Saída"
"03/08/2026","BB Rende Fácil","Rende Facil","9903","9,45","Entrada"
"03/08/2026","Saldo do dia","","","0,00",""
"05/08/2026","Pix - Recebido","05/08 13:51 00033635623814 AMANDA TONI","51351313071502","800,00","Entrada"
"07/08/2026","Recebimento de Proventos","09.041.213/0001-36 SAO PAULO PREVIDENC","406722","8.379,67","Entrada"
"17/08/2026","Pix Agendado","15/08 GUILHERME JOIA BARCELOS  003/007","81701","-1.537,50","Saída"
"31/08/2026","S A L D O","","","0,00",""
`;

  it('deve parsear o Layout v1 e o Layout v2 gerando exatamente as mesmas transações e IDs determinísticos', () => {
    const resV1 = parseBBCsv(mockBBLayoutV1);
    const resV2 = parseBBCsv(mockBBLayoutV2);

    expect(resV1.errors).toHaveLength(0);
    expect(resV2.errors).toHaveLength(0);
    expect(resV1.transactions).toHaveLength(4);
    expect(resV2.transactions).toHaveLength(4);

    // As 4 transações devem ser idênticas (incluindo o ID determinístico para deduplicação)
    expect(resV1.transactions).toEqual(resV2.transactions);

    expect(resV1.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-08-05',
        titulo: 'Pix - Recebido',
        descricao: '05/08 13:51 00033635623814 AMANDA TONI',
        valor: 800.0,
        banco: 'BB',
        account_type: 'CHECKING',
      })
    );

    expect(resV1.transactions[3]).toEqual(
      expect.objectContaining({
        data: '2026-08-17',
        titulo: 'Pix Agendado',
        descricao: '15/08 GUILHERME JOIA BARCELOS  003/007',
        valor: -1537.5,
        parcela_atual: 3,
        total_parcelas: 7,
      })
    );
  });
});

describe('Banco do Brasil Parser - Cartão de Crédito Ourocard (TXT SISBB)', () => {
  const mockBBOurocardClosedTxt = `
                 SISBB - Sistema de Informações Banco do Brasil                 
23/10/2026                       Auto-Atendimento                       14:40:13
                           Fatura do Cartão de Crédito                          
 
Cliente         : SONIA BRITO MELLO                
Nr.Cartão       : 4984.****.****.9324         
Modalidade      : OUROCARD VISA INFINITE           
 
Vencimento      : 10.08.2026          
Total da fatura : R$ 1.434,40       
Pagamento mínimo: R$ 215,16         
 
DEMONSTRATIVO
--------------------------------------------------------------------------------
Data     Transações                             País        Valor R$   Valor US$
--------------------------------------------------------------------------------
         1 - SONIA BRITO MELLO                       
         SALDO FATURA ANTERIOR                  BR          1.672,02        0,00
         Pagamentos/Créditos                         
28.07.2026DESC AUTOMATICO ANUD. TIT-PARC 06/12 BR              -83,00        0,00
10.07.2026PGTO DEBITO CONTA 6851 000002014  200211           -1.672,02        0,00
         Restaurantes                                
11.07.2026DED S PIZZARIA         CAMPINAS      BR               87,50        0,00
         Compras parceladas                          
17.07.2026PORTO SEGURO  PARC 01/10 SAO PAULO   BR              207,71        0,00
         SubTotal                                           1.434,40        0,00
         Total                                              1.434,40        0,00
`;

  it('deve parsear fatura Ourocard TXT ignorando SALDO FATURA ANTERIOR e PGTO DEBITO CONTA', () => {
    const res = parseCSV('BB', mockBBOurocardClosedTxt);
    expect(res.errors).toHaveLength(0);
    expect(res.transactions).toHaveLength(3);

    // Desconto de anuidade (crédito positivo)
    expect(res.transactions[0]).toEqual(
      expect.objectContaining({
        data: '2026-07-28',
        titulo: 'DESC AUTOMATICO ANUD. TIT-PARC 06/12',
        descricao: 'SONIA BRITO MELLO (Final 9324)',
        valor: 83.0,
        banco: 'BB',
        account_type: 'CREDIT_CARD',
        parcela_atual: 6,
        total_parcelas: 12,
      })
    );

    // Compra restaurante (despesa negativa)
    expect(res.transactions[1]).toEqual(
      expect.objectContaining({
        data: '2026-07-11',
        titulo: 'DED S PIZZARIA CAMPINAS',
        descricao: 'SONIA BRITO MELLO (Final 9324)',
        valor: -87.5,
        banco: 'BB',
        account_type: 'CREDIT_CARD',
      })
    );

    // Compra parcelada
    expect(res.transactions[2]).toEqual(
      expect.objectContaining({
        data: '2026-07-17',
        titulo: 'PORTO SEGURO PARC 01/10 SAO PAULO',
        descricao: 'SONIA BRITO MELLO (Final 9324)',
        valor: -207.71,
        parcela_atual: 1,
        total_parcelas: 10,
      })
    );
  });
});

// Testes de reconciliação com os arquivos reais da pasta extratos_vo
const extratosVoDir = path.resolve(__dirname, '../../../extratos_vo');
const hasExtratosVo = fs.existsSync(extratosVoDir);

(hasExtratosVo ? describe : describe.skip)(
  'Reconciliação Contábil com Extratos Reais (extratos_vo)',
  () => {
    const bradescoDir = path.join(extratosVoDir, 'extracted_bradesco');
    const bbDir = path.join(extratosVoDir, 'extracted_fwdbbextratos');

    it('deve reconciliar exatamente os totais de todas as 6 faturas de Cartão Bradesco', () => {
      const invoices: { file: string; expectedTotal: number }[] = [
        { file: 'Bradesco_23082026_113433.csv', expectedTotal: -5328.10 },
        { file: 'Bradesco_23082026_113426.csv', expectedTotal: -6798.69 },
        { file: 'Bradesco_23102026_142938.csv', expectedTotal: -11979.82 },
        { file: 'Bradesco_23102026_142932.csv', expectedTotal: -11317.02 },
        { file: 'Bradesco_23102026_142925.csv', expectedTotal: -11233.80 },
        { file: 'Bradesco_23102026_142915.csv', expectedTotal: -10995.91 },
      ];

      for (const inv of invoices) {
        const content = readLatin1OrUtf8(path.join(bradescoDir, inv.file));
        const res = parseBradescoCsv(content);
        expect(res.errors).toHaveLength(0);
        const sum =
          Math.round(
            res.transactions.reduce((acc, t) => acc + t.valor, 0) * 100
          ) / 100;
        expect(sum).toBe(inv.expectedTotal);
      }

      // Verifica ano de AMAZON PRIME BR 12/12 (2025) na fatura de Outubro vs 1/12 (2026) na fatura de Novembro
      const octRes = parseBradescoCsv(
        readLatin1OrUtf8(path.join(bradescoDir, 'Bradesco_23102026_142925.csv'))
      );
      const amazon12 = octRes.transactions.find((t) =>
        t.titulo.includes('AMAZON PRIME BR 12/12')
      );
      expect(amazon12?.data).toBe('2025-10-03');

      const novRes = parseBradescoCsv(
        readLatin1OrUtf8(path.join(bradescoDir, 'Bradesco_23102026_142915.csv'))
      );
      const amazon1 = novRes.transactions.find((t) =>
        t.titulo.includes('AMAZON PRIME BR 1/12')
      );
      expect(amazon1?.data).toBe('2026-10-03');
    });

    it('deve reconciliar os extratos de Conta Corrente Bradesco sem incluir Lançamentos Futuros', () => {
      const cc1 = parseBradescoCsv(
        readLatin1OrUtf8(path.join(bradescoDir, 'Bradesco_23082026_111749.csv'))
      );
      expect(cc1.errors).toHaveLength(0);
      const credits1 =
        Math.round(
          cc1.transactions
            .filter((t) => t.valor > 0)
            .reduce((a, t) => a + t.valor, 0) * 100
        ) / 100;
      const debits1 =
        Math.round(
          cc1.transactions
            .filter((t) => t.valor < 0)
            .reduce((a, t) => a + t.valor, 0) * 100
        ) / 100;
      expect(credits1).toBe(198078.57);
      expect(debits1).toBe(-186894.67);

      const cc2 = parseBradescoCsv(
        readLatin1OrUtf8(path.join(bradescoDir, 'Bradesco_23102026_142811.csv'))
      );
      expect(cc2.errors).toHaveLength(0);
      // Não deve conter nenhum lançamento futuro de novembro/2026
      expect(cc2.transactions.some((t) => t.data.startsWith('2026-11'))).toBe(
        false
      );
      const credits2 =
        Math.round(
          cc2.transactions
            .filter((t) => t.valor > 0)
            .reduce((a, t) => a + t.valor, 0) * 100
        ) / 100;
      const debits2 =
        Math.round(
          cc2.transactions
            .filter((t) => t.valor < 0)
            .reduce((a, t) => a + t.valor, 0) * 100
        ) / 100;
      expect(credits2).toBe(116455.25);
      expect(debits2).toBe(-139506.32);
    });

    it('deve reconciliar exatamente todas as faturas TXT do Cartão BB Ourocard (fechadas e próxima fatura)', () => {
      const bbInvoices: { file: string; expectedTotal: number }[] = [
        { file: 'OUROCARD_VISA_INFINITE-Ago_26.txt', expectedTotal: -1434.40 },
        { file: 'OUROCARD_VISA_INFINITE-Set_26.txt', expectedTotal: -1592.64 },
        { file: 'OUROCARD_VISA_INFINITE-Out_26.txt', expectedTotal: -1275.45 },
        {
          file: 'OUROCARD_VISA_INFINITE-Pr¢xima_Fatura.txt',
          expectedTotal: -1100.11,
        },
      ];

      for (const inv of bbInvoices) {
        const content = readLatin1OrUtf8(path.join(bbDir, inv.file));
        const res = parseBBCsv(content);
        expect(res.errors).toHaveLength(0);
        const sum =
          Math.round(
            res.transactions.reduce((acc, t) => acc + t.valor, 0) * 100
          ) / 100;
        expect(sum).toBe(inv.expectedTotal);
      }
    });

    it('deve parsear todos os extratos de Conta Corrente BB (Layouts v1 e v2) filtrando Rende Fácil e mantendo compatibilidade de IDs', () => {
      const files = [
        'BBextrato (6).csv',
        'BBextrato (7).csv',
        'BBextrato (8).csv',
        'extrato_082026.csv',
        'extrato_092026.csv',
        'extrato_102026.csv',
      ];

      for (const f of files) {
        const content = readLatin1OrUtf8(path.join(bbDir, f));
        const res = parseBBCsv(content);
        expect(res.errors).toHaveLength(0);
        expect(res.transactions.length).toBeGreaterThan(0);
        // Nenhuma transação de Rende Fácil ou Saldo deve estar presente
        expect(
          res.transactions.some((t) =>
            t.titulo.toLowerCase().includes('rende')
          )
        ).toBe(false);
        expect(
          res.transactions.some((t) =>
            t.titulo.toLowerCase().includes('saldo')
          )
        ).toBe(false);
      }

      // Verifica que todas as 12 transações de BBextrato (8).csv (Layout v1, até 24/08)
      // têm IDs 100% idênticos dentro de extrato_082026.csv (Layout v2, até 31/08)
      const resAugV1 = parseBBCsv(
        readLatin1OrUtf8(path.join(bbDir, 'BBextrato (8).csv'))
      );
      const resAugV2 = parseBBCsv(
        readLatin1OrUtf8(path.join(bbDir, 'extrato_082026.csv'))
      );
      const v2Ids = new Set(resAugV2.transactions.map((t) => t.id));
      for (const tx of resAugV1.transactions) {
        expect(v2Ids.has(tx.id)).toBe(true);
      }
    });

    it('deve reconciliar exatamente as faturas PDF do Cartão BB Ourocard (Jun, Jul e Ago/26)', () => {
      const bbPdfDir = path.join(extratosVoDir, 'extracted_bbextratos');
      const bbPdfs: { file: string; expectedTotal: number }[] = [
        { file: 'OUROCARD_VISA_INFINITE-Jun_26 (1).pdf', expectedTotal: -3797.60 },
        { file: 'OUROCARD_VISA_INFINITE-Jul_26.pdf', expectedTotal: -1672.02 },
        { file: 'OUROCARD_VISA_INFINITE-Ago_26.pdf', expectedTotal: -1434.40 },
      ];

      for (const inv of bbPdfs) {
        const buf = fs.readFileSync(path.join(bbPdfDir, inv.file));
        expect(isPdfBuffer(buf)).toBe(true);
        const extracted = extractPdfText(buf, 'BB');
        const res = parseBBCsv(extracted);
        expect(res.errors).toHaveLength(0);
        const sum =
          Math.round(
            res.transactions.reduce((acc, t) => acc + t.valor, 0) * 100
          ) / 100;
        expect(sum).toBe(inv.expectedTotal);
      }

      // PDF sem texto selecionável (Microsoft Print To PDF) deve retornar erro amigável
      const appBuf = fs.readFileSync(path.join(bbPdfDir, 'BB-aplicacao agosto.pdf'));
      expect(isPdfBuffer(appBuf)).toBe(true);
      const appText = extractPdfText(appBuf, 'BB');
      expect(appText).toBe('');
      const appRes = parseBBCsv('__PDF_NO_TEXT__');
      expect(appRes.transactions).toHaveLength(0);
      expect(appRes.errors[0]).toContain('não possui texto selecionável');
    });

    it('deve reconciliar exatamente as faturas PDF do Cartão Bradesco', () => {
      const bradPdfs: { file: string; expectedTotal: number }[] = [
        { file: 'fatura_bradesco.pdf', expectedTotal: -5328.10 },
        { file: 'fatura_bradesco (1).pdf', expectedTotal: -6798.69 },
        { file: 'fatura_bradesco (3).pdf', expectedTotal: -11979.82 },
        { file: 'fatura_bradesco (4).pdf', expectedTotal: -11317.02 },
      ];

      for (const inv of bradPdfs) {
        const buf = fs.readFileSync(path.join(bradescoDir, inv.file));
        expect(isPdfBuffer(buf)).toBe(true);
        const extracted = extractPdfText(buf, 'BRADESCO');
        const res = parseBradescoCsv(extracted);
        expect(res.errors).toHaveLength(0);
        const sum =
          Math.round(
            res.transactions.reduce((acc, t) => acc + t.valor, 0) * 100
          ) / 100;
        expect(sum).toBe(inv.expectedTotal);
      }
    });
  }
);
