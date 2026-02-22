import { parseC6Csv, ParsedTransaction } from './c6.parser';

export interface ParserResult {
  transactions: ParsedTransaction[];
  errors: string[];
}

export interface BankInfo {
  id: string;
  nome: string;
  descricao: string;
}

const SUPPORTED_BANKS: BankInfo[] = [
  {
    id: 'C6',
    nome: 'C6 Bank',
    descricao: 'Extrato de conta corrente C6 Bank (CSV)',
  },
];

const PARSERS: Record<string, (csv: string) => ParserResult> = {
  C6: parseC6Csv,
};

export function getSupportedBanks(): BankInfo[] {
  return SUPPORTED_BANKS;
}

export function parseCSV(banco: string, csvContent: string): ParserResult {
  const parser = PARSERS[banco.toUpperCase()];
  if (!parser) {
    return {
      transactions: [],
      errors: [`Banco não suportado: ${banco}`],
    };
  }
  return parser(csvContent);
}
