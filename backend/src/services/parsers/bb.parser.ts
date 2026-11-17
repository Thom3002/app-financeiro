import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { ParsedTransaction, ParserResult } from './parser.registry';

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeColumnName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function generateDeterministicId(
  data: string,
  valor: number,
  titulo: string,
  descricao: string,
  banco: string,
  accountType: string,
  occurrence: number = 0,
): string {
  const text = normalizeText(titulo + ' ' + descricao);
  const valorStr = valor.toFixed(2);
  const payload = `${data}|${valorStr}|${text}|${banco}|${accountType}|${occurrence}`;
  return createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

/**
 * Converte números tanto no padrão brasileiro ("8.379,67", "-1.434,40")
 * quanto no padrão com ponto decimal do Layout v1 do BB ("1500.00", "-1537.50").
 */
export function parseBBNumber(valStr: string): number {
  if (!valStr) return 0;
  const clean = valStr.replace(/["\sR$]/g, '');
  if (!clean) return 0;

  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(normalized) || 0;
  }
  return parseFloat(clean) || 0;
}

function splitBBHistorico(historico: string): {
  titulo: string;
  descricao: string;
} {
  const trimmed = (historico || '').trim();
  if (!trimmed) return { titulo: '', descricao: '' };

  // Casos especiais onde o próprio tipo de lançamento possui " - "
  const specialPrefixes = ['Pix - Enviado', 'Pix - Recebido', 'BB Rende Fácil'];
  for (const prefix of specialPrefixes) {
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase() + ' - ')) {
      return {
        titulo: trimmed.substring(0, prefix.length).trim(),
        descricao: trimmed.substring(prefix.length + 3).trim(),
      };
    }
  }

  const sepIdx = trimmed.indexOf(' - ');
  if (sepIdx !== -1) {
    return {
      titulo: trimmed.substring(0, sepIdx).trim(),
      descricao: trimmed.substring(sepIdx + 3).trim(),
    };
  }

  return { titulo: trimmed, descricao: '' };
}

function isIgnoredBBCheckingRow(titulo: string, descricao: string): boolean {
  const normTitle = normalizeText(titulo);
  const normFull = normalizeText(titulo + ' ' + descricao);

  if (
    normTitle === 'saldo anterior' ||
    normTitle === 'saldo do dia' ||
    normTitle === 's a l d o' ||
    normTitle === 'saldo'
  ) {
    return true;
  }

  // Ignora movimentações automáticas diárias do BB Rende Fácil (doc 9903)
  if (
    normTitle.includes('bb rende facil') ||
    normFull.includes('rende facil')
  ) {
    return true;
  }

  return false;
}

function parseBBCreditCardTxt(content: string): ParserResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  const lines = content.split('\n');

  let cliente = '';
  let cardLast4 = '';
  let refDate = new Date();

  // Extrai metadados do cabeçalho do SISBB
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const autoAtendMatch = line.match(
      /^(\d{2})\/(\d{2})\/(\d{4})\s+Auto-Atendimento/i,
    );
    if (autoAtendMatch) {
      refDate = new Date(
        parseInt(autoAtendMatch[3], 10),
        parseInt(autoAtendMatch[2], 10) - 1,
        parseInt(autoAtendMatch[1], 10),
      );
    }

    const clienteMatch = line.match(/^Cliente\s*:\s*(.+)$/i);
    if (clienteMatch) {
      cliente = clienteMatch[1].trim();
    }

    const cardMatch = line.match(/^Nr\.?\s*Cart[aã]o\s*:\s*.*?(\d{4})\s*$/i);
    if (cardMatch) {
      cardLast4 = cardMatch[1].trim();
    }

    const vencMatch = line.match(
      /^Vencimento\s*:\s*(\d{2})[./](\d{2})[./](\d{4})/i,
    );
    if (vencMatch) {
      refDate = new Date(
        parseInt(vencMatch[3], 10),
        parseInt(vencMatch[2], 10) - 1,
        parseInt(vencMatch[1], 10),
      );
    }
  }

  const cardDescription =
    cliente && cardLast4
      ? `${cliente} (Final ${cardLast4})`
      : cliente || (cardLast4 ? `Cartão Final ${cardLast4}` : 'Ourocard BB');

  let inDemonstrativo = false;
  const parsedTxList: {
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
    parcela_atual?: number | null;
    total_parcelas?: number | null;
  }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^DEMONSTRATIVO$/i.test(line)) {
      inDemonstrativo = true;
      continue;
    }

    if (
      inDemonstrativo &&
      (/^(SubTotal|Total)\b/i.test(line) ||
        /^RESUMO EM REAL/i.test(line) ||
        /^LIMITES\s*-/i.test(line))
    ) {
      break;
    }

    if (!inDemonstrativo) continue;

    // Ignora linhas de saldo anterior ou cabeçalhos de tabela
    if (
      /SALDO FATURA ANTERIOR/i.test(line) ||
      /^Data\s+Transa/i.test(line) ||
      /^-{5,}/.test(line)
    ) {
      continue;
    }

    // Padrão 1: Fatura fechada com data DD.MM.YYYY (colada ou separada do histórico)
    // Ex: 11.07.2026DED S PIZZARIA         CAMPINAS      BR               87,50        0,00
    const closedMatch = line.match(
      /^(\d{2})\.(\d{2})\.(\d{4})\s*(.+?)\s+(-?\d[\d.]*,\d{2})\s+(-?\d[\d.]*,\d{2})$/,
    );

    // Padrão 2: Fatura aberta / Próxima Fatura com data DD/MM
    // Ex: 12/10    IFD*iFood              Osasco          BR             12,90        0,00
    const openMatch = !closedMatch
      ? line.match(
          /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?\d[\d.]*,\d{2})\s+(-?\d[\d.]*,\d{2})$/,
        )
      : null;

    if (!closedMatch && !openMatch) {
      continue;
    }

    let isoDate = '';
    let rawMiddle = '';
    let rawValBrl = '';

    if (closedMatch) {
      const [, dd, mm, yyyy, middle, valBrl] = closedMatch;
      isoDate = `${yyyy}-${mm}-${dd}`;
      rawMiddle = middle;
      rawValBrl = valBrl;
    } else if (openMatch) {
      const [, dd, mm, middle, valBrl] = openMatch;
      const txMonth = parseInt(mm, 10);
      const refMonth = refDate.getMonth() + 1;
      const refYear = refDate.getFullYear();
      const txYear = txMonth > refMonth ? refYear - 1 : refYear;
      isoDate = `${txYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      rawMiddle = middle;
      rawValBrl = valBrl;
    }

    // Remove código do país ("BR") no final da descrição e normaliza múltiplos espaços
    const cleanedTitle = rawMiddle
      .replace(/\s+BR$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Ignora o pagamento da fatura anterior para evitar receita fantasma e dupla contagem
    const normTitle = normalizeText(cleanedTitle);
    if (
      normTitle.startsWith('pgto debito conta') ||
      normTitle.startsWith('pagto debito conta') ||
      normTitle.startsWith('saldo fatura anterior')
    ) {
      continue;
    }

    const parsedVal = parseBBNumber(rawValBrl);
    if (parsedVal === 0) continue;

    // Na fatura do cartão: compras são positivas (viram negativas = despesa)
    // Créditos/descontos (ex: DESC AUTOMATICO ANUD.) são negativos (viram positivos)
    const valor = Math.round(-parsedVal * 100) / 100;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;
    const parcMatch = cleanedTitle.match(/\bPARC\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (parcMatch) {
      parcela_atual = parseInt(parcMatch[1], 10);
      total_parcelas = parseInt(parcMatch[2], 10);
    }

    parsedTxList.push({
      data: isoDate,
      titulo: cleanedTitle,
      descricao: cardDescription,
      valor,
      parcela_atual,
      total_parcelas,
    });
  }

  const occurrenceMap = new Map<string, number>();
  for (const tx of parsedTxList) {
    const baseKey = `${tx.data}|${tx.valor.toFixed(2)}|${normalizeText(tx.titulo + ' ' + tx.descricao)}|BB|CREDIT_CARD`;
    const occurrence = occurrenceMap.get(baseKey) || 0;
    occurrenceMap.set(baseKey, occurrence + 1);

    const id = generateDeterministicId(
      tx.data,
      tx.valor,
      tx.titulo,
      tx.descricao,
      'BB',
      'CREDIT_CARD',
      occurrence,
    );

    const item: ParsedTransaction = {
      id,
      data: tx.data,
      titulo: tx.titulo,
      descricao: tx.descricao,
      valor: tx.valor,
      banco: 'BB',
      account_type: 'CREDIT_CARD',
    };
    if (tx.parcela_atual && tx.total_parcelas) {
      item.parcela_atual = tx.parcela_atual;
      item.total_parcelas = tx.total_parcelas;
    }
    transactions.push(item);
  }

  return { transactions, errors };
}

function parseBBCheckingCsv(content: string): ParserResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  const lines = content.split('\n');

  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const firstCell = lines[i].split(',')[0].replace(/"/g, '').trim();
    if (normalizeColumnName(firstCell) === 'data') {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    return {
      transactions: [],
      errors: ['Cabeçalho não encontrado no CSV do Banco do Brasil.'],
    };
  }

  const csvFromHeader = lines.slice(headerLineIndex).join('\n');
  let records: string[][];
  try {
    records = parse(csvFromHeader, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    return {
      transactions: [],
      errors: [`Erro ao parsear CSV do Banco do Brasil: ${(e as Error).message}`],
    };
  }

  if (records.length < 2) {
    return {
      transactions: [],
      errors: ['Extrato do Banco do Brasil sem transações após o cabeçalho.'],
    };
  }

  const header = records[0].map(normalizeColumnName);
  const dataIdx = header.indexOf('data');
  const valorIdx = header.indexOf('valor');
  const historicoIdx = header.indexOf('historico');
  const lancamentoIdx = header.indexOf('lancamento');
  const detalhesIdx = header.indexOf('detalhes');

  const isLayoutV1 = historicoIdx !== -1;
  const isLayoutV2 = lancamentoIdx !== -1;

  if (dataIdx === -1 || valorIdx === -1 || (!isLayoutV1 && !isLayoutV2)) {
    return {
      transactions: [],
      errors: [
        'Colunas obrigatórias não encontradas no extrato de conta corrente do Banco do Brasil.',
      ],
    };
  }

  const occurrenceMap = new Map<string, number>();

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length <= valorIdx) continue;

    const dataStr = (row[dataIdx] || '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) continue;

    let titulo = '';
    let descricao = '';

    if (isLayoutV2) {
      titulo = (row[lancamentoIdx] || '').trim();
      descricao = detalhesIdx !== -1 ? (row[detalhesIdx] || '').trim() : '';
    } else {
      const rawHistorico = (row[historicoIdx] || '').trim();
      const split = splitBBHistorico(rawHistorico);
      titulo = split.titulo;
      descricao = split.descricao;
    }

    if (!titulo && !descricao) continue;
    if (isIgnoredBBCheckingRow(titulo, descricao)) continue;

    const rawValor = (row[valorIdx] || '').trim();
    const valor = Math.round(parseBBNumber(rawValor) * 100) / 100;
    if (valor === 0) continue;

    const [dd, mm, yyyy] = dataStr.split('/');
    const isoDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;
    const parcMatch = (descricao || titulo).match(/\b0*(\d{1,2})\/0*(\d{1,2})$/);
    if (parcMatch && /\b\d{3}\/\d{3}$/.test(descricao || titulo)) {
      parcela_atual = parseInt(parcMatch[1], 10);
      total_parcelas = parseInt(parcMatch[2], 10);
    }

    const baseKey = `${isoDate}|${valor.toFixed(2)}|${normalizeText(titulo + ' ' + descricao)}|BB|CHECKING`;
    const occurrence = occurrenceMap.get(baseKey) || 0;
    occurrenceMap.set(baseKey, occurrence + 1);

    const id = generateDeterministicId(
      isoDate,
      valor,
      titulo,
      descricao,
      'BB',
      'CHECKING',
      occurrence,
    );

    const item: ParsedTransaction = {
      id,
      data: isoDate,
      titulo,
      descricao,
      valor,
      banco: 'BB',
      account_type: 'CHECKING',
    };
    if (parcela_atual && total_parcelas) {
      item.parcela_atual = parcela_atual;
      item.total_parcelas = total_parcelas;
    }

    transactions.push(item);
  }

  return { transactions, errors };
}

function parseBBCreditCardPdfText(content: string): ParserResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  const lines = content.split('\n');

  let refDate = new Date();
  let defaultCardDesc = 'Ourocard BB';

  // Extrai data de fechamento / vencimento e cartão padrão do cabeçalho
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const closedMatch = line.match(
      /Fatura fechada em\s*\|\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    );
    if (closedMatch) {
      refDate = new Date(
        parseInt(closedMatch[3], 10),
        parseInt(closedMatch[2], 10) - 1,
        parseInt(closedMatch[1], 10),
      );
      break;
    }
    if (/^Vencimento$/i.test(line)) {
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const dm = lines[j].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (dm) {
          refDate = new Date(
            parseInt(dm[3], 10),
            parseInt(dm[2], 10) - 1,
            parseInt(dm[1], 10),
          );
          break;
        }
      }
    }
  }

  let currentCardDesc = defaultCardDesc;
  let inLancamentos = false;

  const parsedTxList: {
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
    parcela_atual?: number | null;
    total_parcelas?: number | null;
  }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/Lançamentos nesta fatura/i.test(line)) {
      inLancamentos = true;
      continue;
    }

    if (inLancamentos && /^(Subtotal|Total da Fatura)\b/i.test(line)) {
      break;
    }

    if (!inLancamentos) continue;

    // Cabeçalho de cartão: "Sonia Brito Mello  (Cartão 9324)"
    const cardHeaderMatch = line.match(/^(.+?)\s+\(Cart[aã]o\s+(\d{4})\)$/i);
    if (cardHeaderMatch) {
      currentCardDesc = `${cardHeaderMatch[1].trim().toUpperCase()} (Final ${cardHeaderMatch[2]})`;
      continue;
    }

    // Linha de lançamento: "10/06 | PGTO DEBITO CONTA ... | BR | R$ -3.797,60"
    const txMatch = line.match(
      /^(\d{2})\/(\d{2})\s*\|\s*(.+?)\s*\|\s*[A-Z]{2}\s*\|\s*R\$\s*(-?[\d.,]+)$/,
    );
    if (!txMatch) continue;

    const [, dd, mm, rawDesc, rawValBrl] = txMatch;
    const cleanedTitle = rawDesc.replace(/\s+/g, ' ').trim();
    const normTitle = normalizeText(cleanedTitle);

    if (
      normTitle.startsWith('pgto debito conta') ||
      normTitle.startsWith('pagto debito conta') ||
      normTitle.startsWith('saldo fatura anterior')
    ) {
      continue;
    }

    const parsedVal = parseBBNumber(rawValBrl);
    if (parsedVal === 0) continue;

    const txMonth = parseInt(mm, 10);
    const refMonth = refDate.getMonth() + 1;
    const refYear = refDate.getFullYear();
    const txYear = txMonth > refMonth ? refYear - 1 : refYear;
    const isoDate = `${txYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

    const valor = Math.round(-parsedVal * 100) / 100;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;
    const parcMatch = cleanedTitle.match(/\bPARC\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (parcMatch) {
      parcela_atual = parseInt(parcMatch[1], 10);
      total_parcelas = parseInt(parcMatch[2], 10);
    }

    parsedTxList.push({
      data: isoDate,
      titulo: cleanedTitle,
      descricao: currentCardDesc,
      valor,
      parcela_atual,
      total_parcelas,
    });
  }

  const occurrenceMap = new Map<string, number>();
  for (const tx of parsedTxList) {
    const baseKey = `${tx.data}|${tx.valor.toFixed(2)}|${normalizeText(tx.titulo + ' ' + tx.descricao)}|BB|CREDIT_CARD`;
    const occurrence = occurrenceMap.get(baseKey) || 0;
    occurrenceMap.set(baseKey, occurrence + 1);

    const id = generateDeterministicId(
      tx.data,
      tx.valor,
      tx.titulo,
      tx.descricao,
      'BB',
      'CREDIT_CARD',
      occurrence,
    );

    const item: ParsedTransaction = {
      id,
      data: tx.data,
      titulo: tx.titulo,
      descricao: tx.descricao,
      valor: tx.valor,
      banco: 'BB',
      account_type: 'CREDIT_CARD',
    };
    if (tx.parcela_atual && tx.total_parcelas) {
      item.parcela_atual = tx.parcela_atual;
      item.total_parcelas = tx.total_parcelas;
    }
    transactions.push(item);
  }

  return { transactions, errors };
}

export function parseBBCsv(rawContent: string): ParserResult {
  if (rawContent === '__PDF_NO_TEXT__') {
    return {
      transactions: [],
      errors: [
        'Este PDF não possui texto selecionável (foi gerado como imagem/vetor). Exporte o extrato em CSV ou TXT.',
      ],
    };
  }

  const content = (rawContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const norm = normalizeText(content);

  // Detecta Fatura de Cartão de Crédito BB (Ourocard PDF extraído)
  if (
    norm.includes('ourocard') &&
    norm.includes('lancamentos nesta fatura')
  ) {
    return parseBBCreditCardPdfText(content);
  }

  // Detecta Fatura de Cartão de Crédito BB (Ourocard SISBB .txt)
  const isCreditCardTxt =
    norm.includes('sisbb') ||
    norm.includes('fatura do cartao de credito') ||
    (norm.includes('ourocard') && norm.includes('demonstrativo'));

  if (isCreditCardTxt) {
    return parseBBCreditCardTxt(content);
  }

  // Detecta Extrato de Conta Corrente BB (CSV Layout v1 ou v2)
  const isCheckingCsv =
    (norm.includes('dependencia origem') && norm.includes('historico')) ||
    (norm.includes('lancamento') &&
      norm.includes('detalhes') &&
      norm.includes('documento'));

  if (isCheckingCsv) {
    return parseBBCheckingCsv(content);
  }

  return {
    transactions: [],
    errors: [
      'Não foi possível identificar o formato do extrato Banco do Brasil (Conta Corrente CSV ou Cartão Ourocard TXT/PDF).',
    ],
  };
}

