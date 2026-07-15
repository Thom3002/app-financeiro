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

function getTransactionYear(txMonth: number, statementDate: Date): number {
  const statementMonth = statementDate.getMonth() + 1; // 1-12
  const statementYear = statementDate.getFullYear();
  if (txMonth > statementMonth) {
    return statementYear - 1;
  }
  return statementYear;
}

export function parseBradescoCsv(csvContent: string): ParserResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Normalize line endings
  const content = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');

  // Detect type based on content
  const normalizedContent = normalizeText(csvContent);
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

    let currentCardInfo = '';
    const parsedTxList: {
      data: string;
      titulo: string;
      descricao: string;
      valor: number;
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

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
          if (title.toUpperCase() === 'SALDO ANTERIOR' || title.toLowerCase().startsWith('total')) {
            continue;
          }

          const rawValue = parts[3];
          const parsedVal = parseBrlNumber(rawValue);
          // Credit card transactions in CSV: purchases are positive, credits/payments are negative.
          // We invert this: purchases become negative (expense), credits become positive.
          const valor = -parsedVal;

          const [dd, mm] = dateStr.split('/');
          const txMonth = parseInt(mm, 10);
          const txDay = parseInt(dd, 10);
          const txYear = getTransactionYear(txMonth, statementDate);

          const isoDate = `${txYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

          parsedTxList.push({
            data: isoDate,
            titulo: title,
            descricao: currentCardInfo,
            valor: Math.round(valor * 100) / 100,
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

      transactions.push({
        id,
        data: tx.data,
        titulo: tx.titulo,
        descricao: tx.descricao,
        valor: tx.valor,
        banco: 'BRADESCO',
        account_type: 'CREDIT_CARD',
      });
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
