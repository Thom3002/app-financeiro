import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';

export interface ParsedTransaction {
  id: string;
  data: string;
  titulo: string;
  descricao: string;
  valor: number;
  banco: string;
}

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
  occurrence: number = 0,
): string {
  const text = normalizeText(titulo + ' ' + descricao);
  const valorStr = valor.toFixed(2);
  const payload = `${data}|${valorStr}|${text}|${banco}|${occurrence}`;
  return createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const COLUMN_MAP: Record<string, string> = {
  datalancamento: 'dataLancamento',
  titulo: 'titulo',
  descricao: 'descricao',
  entradar: 'entrada',
  saidar: 'saida',
};

export function parseC6Csv(csvContent: string): {
  transactions: ParsedTransaction[];
  errors: string[];
} {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Normalize line endings
  const content = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');

  // Find header line
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const firstCell = lines[i].split(',')[0].trim();
    const normalized = normalizeColumnName(firstCell);
    if (normalized === 'datalancamento') {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    errors.push(
      'Cabeçalho não encontrado: coluna "Data Lançamento" não encontrada no CSV.',
    );
    return { transactions, errors };
  }

  // Parse from header line onward
  const csvFromHeader = lines.slice(headerLineIndex).join('\n');
  let records: string[][];
  try {
    records = parse(csvFromHeader, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    errors.push(`Erro ao parsear CSV: ${(e as Error).message}`);
    return { transactions, errors };
  }

  if (records.length < 2) {
    errors.push('CSV sem transações após o cabeçalho.');
    return { transactions, errors };
  }

  // Map column indices
  const header = records[0];
  const columnIndices: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const normalized = normalizeColumnName(header[i]);
    if (COLUMN_MAP[normalized]) {
      columnIndices[COLUMN_MAP[normalized]] = i;
    }
  }

  const requiredColumns = [
    'dataLancamento',
    'titulo',
    'descricao',
    'entrada',
    'saida',
  ];
  for (const col of requiredColumns) {
    if (columnIndices[col] === undefined) {
      errors.push(`Coluna obrigatória não encontrada: ${col}`);
    }
  }
  if (errors.length > 0) return { transactions, errors };

  // Parse data rows
  const occurrenceMap = new Map<string, number>();

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length < 5) continue;

    try {
      const dataLancStr = (
        row[columnIndices['dataLancamento']] || ''
      ).trim();
      const titulo = (row[columnIndices['titulo']] || '').trim();
      const descricao = (row[columnIndices['descricao']] || '').trim();
      const entradaStr = (row[columnIndices['entrada']] || '0').trim();
      const saidaStr = (row[columnIndices['saida']] || '0').trim();

      if (!dataLancStr) continue;

      const entrada = parseFloat(entradaStr) || 0;
      const saida = parseFloat(saidaStr) || 0;

      let valor: number;
      if (entrada !== 0) {
        valor = Math.abs(entrada);
      } else if (saida !== 0) {
        valor = -Math.abs(saida);
      } else {
        continue; // Both zero, skip
      }

      // Validate date format DD/MM/YYYY
      const dateParts = dataLancStr.split('/');
      if (dateParts.length !== 3) {
        errors.push(`Linha ${i + 1}: formato de data inválido: ${dataLancStr}`);
        continue;
      }
      const [dd, mm, yyyy] = dateParts;
      const isoDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

      // Track occurrence count for duplicate payloads
      const text = normalizeText(titulo + ' ' + descricao);
      const valorStr = valor.toFixed(2);
      const baseKey = `${dataLancStr}|${valorStr}|${text}|C6`;
      const occurrence = occurrenceMap.get(baseKey) || 0;
      occurrenceMap.set(baseKey, occurrence + 1);

      const id = generateDeterministicId(
        dataLancStr,
        valor,
        titulo,
        descricao,
        'C6',
        occurrence,
      );

      transactions.push({
        id,
        data: isoDate,
        titulo,
        descricao,
        valor: Math.round(valor * 100) / 100,
        banco: 'C6',
      });
    } catch (e) {
      errors.push(
        `Linha ${i + 1}: erro ao processar: ${(e as Error).message}`,
      );
    }
  }

  return { transactions, errors };
}
