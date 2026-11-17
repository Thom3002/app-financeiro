import { createHash } from 'crypto';
import { ParsedTransaction, ParserResult } from './parser.registry';

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
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

function parseBrlNumber(valStr: string): number {
  if (!valStr) return 0;
  const clean = valStr.replace(/["\s]/g, '');
  // Remove dots (thousands separator) and replace comma with dot (decimal separator)
  const normalized = clean.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(normalized) || 0;
}

function getTransactionYear(
  txMonth: number,
  statementDate: Date,
  parcelaAtual: number | null = null,
): number {
  const statementMonth = statementDate.getMonth() + 1; // 1-12
  const statementYear = statementDate.getFullYear();
  if (
    txMonth > statementMonth ||
    (parcelaAtual !== null && parcelaAtual > 1 && txMonth === statementMonth)
  ) {
    return statementYear - 1;
  }
  return statementYear;
}

function parseBradescoPdfText(content: string): ParserResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  const lines = content.split('\n');

  let statementDate = new Date();
  let defaultHolder = '';
  let defaultCardLast4 = '';

  // Na página 1, extrai vencimento (DD / MM / YYYY) e titular
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const vencMatch = line.match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
    if (vencMatch) {
      statementDate = new Date(
        parseInt(vencMatch[3], 10),
        parseInt(vencMatch[2], 10) - 1,
        parseInt(vencMatch[1], 10),
      );
      break;
    }
    const cardNumMatch = line.match(
      /^N[úu]mero do Cart[ãa]o\s+\d{4}\s+XXXX\s+XXXX\s+(\d{4})/i,
    );
    if (cardNumMatch) {
      defaultCardLast4 = cardNumMatch[1];
    }
  }

  let currentCardInfo = defaultCardLast4 ? `Final ${defaultCardLast4}` : '';
  let pendingHolder = '';

  const parsedTxList: {
    data: string;
    titulo: string;
    descricao: string;
    valor: number;
    parcela_atual?: number | null;
    total_parcelas?: number | null;
    ignorar_dashboard?: boolean;
    ignore_reason?: string | null;
  }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Total da fatura em real/i.test(line)) {
      break;
    }

    // Cabeçalho de titular + cartão no PDF: linha com nome em maiúsculas seguida de "Cartão 4066 XXXX XXXX 5916"
    const cartaoLineMatch = line.match(
      /^Cart[ãa]o\s+\d{4}\s+XXXX\s+XXXX\s+(\d{4})$/i,
    );
    if (cartaoLineMatch) {
      const holder = pendingHolder || defaultHolder;
      currentCardInfo = holder
        ? `${holder} (Final ${cartaoLineMatch[1]})`
        : `Final ${cartaoLineMatch[1]}`;
      if (!defaultHolder && holder) defaultHolder = holder;
      pendingHolder = '';
      continue;
    }

    if (
      /^[A-ZÀ-Ú][A-ZÀ-Ú\s.]{3,}$/.test(line) &&
      !line.includes('FATURA') &&
      !line.includes('CAMPINAS') &&
      !line.includes('VISA') &&
      !line.includes('TOTAL') &&
      !line.includes('PAGTO') &&
      !line.includes('BRADESCO')
    ) {
      pendingHolder = line;
    }

    const txMatch = line.match(
      /^(\d{2})\s*\/\s*(\d{2})\s+(.+?)\s+([\d.,]+)(\s*-)?$/,
    );
    if (!txMatch) continue;

    const [, dd, mm, rawTitle, valStr, minusFlag] = txMatch;
    const title = rawTitle.replace(/\s+/g, ' ').trim();
    const normTitle = normalizeText(title);

    if (
      normTitle === 'saldo anterior' ||
      normTitle.startsWith('pagto. por deb em c/c') ||
      normTitle.startsWith('pagto por deb em c/c') ||
      normTitle.startsWith('total')
    ) {
      continue;
    }

    let parsedVal = parseBrlNumber(valStr);
    if (minusFlag) parsedVal = -parsedVal;
    const valor = -parsedVal;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;
    const parcMatch = title.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (parcMatch) {
      const p1 = parseInt(parcMatch[1], 10);
      const p2 = parseInt(parcMatch[2], 10);
      if (p1 >= 1 && p2 >= p1 && p2 <= 60) {
        parcela_atual = p1;
        total_parcelas = p2;
      }
    }

    const txMonth = parseInt(mm, 10);
    const txYear = getTransactionYear(txMonth, statementDate, parcela_atual);
    const isoDate = `${txYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const isAntecipado = normTitle.startsWith('pagto antecipado');

    parsedTxList.push({
      data: isoDate,
      titulo: title,
      descricao: currentCardInfo,
      valor: Math.round(valor * 100) / 100,
      parcela_atual,
      total_parcelas,
      ignorar_dashboard: isAntecipado ? true : undefined,
      ignore_reason: isAntecipado ? 'Pagamento antecipado de fatura' : undefined,
    });
  }

  const occurrenceMap = new Map<string, number>();
  for (const tx of parsedTxList) {
    const baseKey = `${tx.data}|${tx.valor.toFixed(2)}|${normalizeText(tx.titulo + ' ' + tx.descricao)}|BRADESCO|CREDIT_CARD`;
    const occurrence = occurrenceMap.get(baseKey) || 0;
    occurrenceMap.set(baseKey, occurrence + 1);

    const id = generateDeterministicId(
      tx.data,
      tx.valor,
      tx.titulo,
      tx.descricao,
      'BRADESCO',
      'CREDIT_CARD',
      occurrence,
    );

    const item: ParsedTransaction = {
      id,
      data: tx.data,
      titulo: tx.titulo,
      descricao: tx.descricao,
      valor: tx.valor,
      banco: 'BRADESCO',
      account_type: 'CREDIT_CARD',
    };
    if (tx.parcela_atual && tx.total_parcelas) {
      item.parcela_atual = tx.parcela_atual;
      item.total_parcelas = tx.total_parcelas;
    }
    if (tx.ignorar_dashboard) {
      item.ignorar_dashboard = true;
      item.ignore_reason = tx.ignore_reason;
    }
    transactions.push(item);
  }

  return { transactions, errors };
}

export function parseBradescoCsv(csvContent: string): ParserResult {
  if (csvContent === '__PDF_NO_TEXT__') {
    return {
      transactions: [],
      errors: [
        'Este PDF não possui texto selecionável (foi gerado como imagem/vetor). Exporte o extrato em CSV.',
      ],
    };
  }

  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Normalize line endings
  const content = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');

  // Detect type based on content
  const normalizedContent = normalizeText(csvContent);

  if (
    normalizedContent.includes('fatura mensal') &&
    normalizedContent.includes('historico de lancamentos')
  ) {
    return parseBradescoPdfText(content);
  }

  const isCreditCard = /valor\(r\$\)/i.test(normalizedContent);
  const isChecking = /credito\s*\(r\$\)/i.test(normalizedContent) || /debito\s*\(r\$\)/i.test(normalizedContent);

  if (!isCreditCard && !isChecking) {
    return {
      transactions: [],
      errors: ['Não foi possível identificar o formato do extrato Bradesco (Conta Corrente ou Cartão de Crédito).'],
    };
  }

  if (isCreditCard) {
    // ----------------------------------------------------
    // PARSER DE CARTÃO DE CRÉDITO
    // ----------------------------------------------------
    let statementDate = new Date(); // fallback to current date
    // Try to find the statement creation date
    for (const line of lines) {
      const dateMatch = line.match(/data:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
      if (dateMatch) {
        statementDate = new Date(
          parseInt(dateMatch[3], 10),
          parseInt(dateMatch[2], 10) - 1,
          parseInt(dateMatch[1], 10)
        );
        break;
      }
    }

    // Se houver linha de SALDO ANTERIOR (ex: "01/09;SALDO ANTERIOR"), o mês dela indica o mês de fechamento da fatura
    for (const line of lines) {
      const saldoMatch = line.trim().match(/^(\d{2})\/(\d{2});\s*SALDO ANTERIOR/i);
      if (saldoMatch) {
        const saldoMonth = parseInt(saldoMatch[2], 10);
        const exportMonth = statementDate.getMonth() + 1;
        const exportYear = statementDate.getFullYear();
        const invoiceYear = saldoMonth > exportMonth ? exportYear - 1 : exportYear;
        statementDate = new Date(invoiceYear, saldoMonth - 1, 28);
        break;
      }
    }

    let currentCardInfo = '';
    const parsedTxList: {
      data: string;
      titulo: string;
      descricao: string;
      valor: number;
      parcela_atual?: number | null;
      total_parcelas?: number | null;
      ignorar_dashboard?: boolean;
      ignore_reason?: string | null;
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Para ao chegar no resumo final da fatura
      if (/^total da fatura em real/i.test(line) || /^resumo das despesas/i.test(line)) {
        break;
      }

      // Check for cardholder / card info header
      // Format: MAEVE B MELLO ;;; 4961
      const cardMatch = line.match(/^([^;]+);\s*;\s*;\s*(\d{4})/);
      if (cardMatch) {
        currentCardInfo = `${cardMatch[1].trim()} (Final ${cardMatch[2].trim()})`;
        continue;
      }

      const parts = line.split(';');
      if (parts.length >= 4) {
        const dateStr = parts[0].trim();
        // Check if dateStr matches DD/MM format (e.g., 19/04)
        if (/^\d{2}\/\d{2}$/.test(dateStr)) {
          const title = parts[1].trim();
          const normTitle = normalizeText(title);
          if (
            normTitle === 'saldo anterior' ||
            normTitle.startsWith('pagto. por deb em c/c') ||
            normTitle.startsWith('pagto por deb em c/c') ||
            normTitle.startsWith('total')
          ) {
            continue;
          }

          const rawValue = parts[3];
          const parsedVal = parseBrlNumber(rawValue);
          // Credit card transactions in CSV: purchases are positive, credits/payments are negative.
          // We invert this: purchases become negative (expense), credits become positive.
          const valor = -parsedVal;

          let parcela_atual: number | null = null;
          let total_parcelas: number | null = null;
          const parcMatch = title.match(/\s+(\d{1,2})\/(\d{1,2})$/);
          if (parcMatch) {
            const p1 = parseInt(parcMatch[1], 10);
            const p2 = parseInt(parcMatch[2], 10);
            if (p1 >= 1 && p2 >= p1 && p2 <= 60) {
              parcela_atual = p1;
              total_parcelas = p2;
            }
          }

          const [dd, mm] = dateStr.split('/');
          const txMonth = parseInt(mm, 10);
          const txYear = getTransactionYear(txMonth, statementDate, parcela_atual);

          const isoDate = `${txYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

          const isAntecipado = normTitle.startsWith('pagto antecipado');

          parsedTxList.push({
            data: isoDate,
            titulo: title,
            descricao: currentCardInfo,
            valor: Math.round(valor * 100) / 100,
            parcela_atual,
            total_parcelas,
            ignorar_dashboard: isAntecipado ? true : undefined,
            ignore_reason: isAntecipado ? 'Pagamento antecipado de fatura' : undefined,
          });
        }
      }
    }

    const occurrenceMap = new Map<string, number>();
    for (const tx of parsedTxList) {
      const baseKey = `${tx.data}|${tx.valor.toFixed(2)}|${normalizeText(tx.titulo + ' ' + tx.descricao)}|BRADESCO|CREDIT_CARD`;
      const occurrence = occurrenceMap.get(baseKey) || 0;
      occurrenceMap.set(baseKey, occurrence + 1);

      const id = generateDeterministicId(
        tx.data,
        tx.valor,
        tx.titulo,
        tx.descricao,
        'BRADESCO',
        'CREDIT_CARD',
        occurrence
      );

      const item: ParsedTransaction = {
        id,
        data: tx.data,
        titulo: tx.titulo,
        descricao: tx.descricao,
        valor: tx.valor,
        banco: 'BRADESCO',
        account_type: 'CREDIT_CARD',
      };
      if (tx.parcela_atual && tx.total_parcelas) {
        item.parcela_atual = tx.parcela_atual;
        item.total_parcelas = tx.total_parcelas;
      }
      if (tx.ignorar_dashboard) {
        item.ignorar_dashboard = true;
        item.ignore_reason = tx.ignore_reason;
      }
      transactions.push(item);
    }

  } else {
    // ----------------------------------------------------
    // PARSER DE CONTA CORRENTE
    // ----------------------------------------------------
    const parsedTxList: {
      data: string;
      titulo: string;
      descricao: string;
      valor: number;
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const normLine = normalizeText(line);
      // Interrompe antes da seção de Lançamentos Futuros ou rodapé final do extrato
      if (
        normLine.startsWith('lancamentos futuros') ||
        normLine.startsWith('os dados acima tem como base')
      ) {
        break;
      }

      const parts = line.split(';');
      const dateStr = parts[0] ? parts[0].trim() : '';

      // Check if dateStr matches DD/MM/YY or DD/MM/YYYY format (e.g. 02/03/26 or 02/03/2026)
      if (/^\d{2}\/\d{2}\/(\d{2}|\d{4})$/.test(dateStr)) {
        if (parts.length >= 5) {
          const title = parts[1].trim();
          if (title.toUpperCase() === 'SALDO ANTERIOR' || title.toLowerCase().startsWith('total')) {
            continue;
          }

          const creditStr = parts[3];
          const debitStr = parts[4];

          let valor = 0;
          if (creditStr && creditStr.trim() !== '') {
            valor = Math.abs(parseBrlNumber(creditStr));
          } else if (debitStr && debitStr.trim() !== '') {
            valor = -Math.abs(parseBrlNumber(debitStr));
          } else {
            // Both empty, ignore line
            continue;
          }

          const [dd, mm, yy] = dateStr.split('/');
          const year = yy.length === 2 ? '20' + yy : yy;
          const isoDate = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

          parsedTxList.push({
            data: isoDate,
            titulo: title,
            descricao: '',
            valor: Math.round(valor * 100) / 100,
          });
        }
      } else if (dateStr === '' && parts.length >= 2 && parts[1] && parts[1].trim() !== '') {
        // This is a details line (description) belonging to the previous transaction
        const detailsText = parts[1].trim();
        if (detailsText.toLowerCase() === 'total' || detailsText.toLowerCase().startsWith('total')) {
          continue;
        }

        if (parsedTxList.length > 0) {
          const lastTx = parsedTxList[parsedTxList.length - 1];
          lastTx.descricao = lastTx.descricao
            ? `${lastTx.descricao} ${detailsText}`
            : detailsText;
        }
      }
    }

    const occurrenceMap = new Map<string, number>();
    for (const tx of parsedTxList) {
      const baseKey = `${tx.data}|${tx.valor.toFixed(2)}|${normalizeText(tx.titulo + ' ' + tx.descricao)}|BRADESCO|CHECKING`;
      const occurrence = occurrenceMap.get(baseKey) || 0;
      occurrenceMap.set(baseKey, occurrence + 1);

      const id = generateDeterministicId(
        tx.data,
        tx.valor,
        tx.titulo,
        tx.descricao,
        'BRADESCO',
        'CHECKING',
        occurrence
      );

      transactions.push({
        id,
        data: tx.data,
        titulo: tx.titulo,
        descricao: tx.descricao,
        valor: tx.valor,
        banco: 'BRADESCO',
        account_type: 'CHECKING',
      });
    }
  }

  return { transactions, errors };
}
