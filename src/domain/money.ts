import type { Cents } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Formata centavos como moeda brasileira: 123456 -> "R$ 1.234,56". */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

export function formatBRLCompact(cents: Cents): string {
  return brlCompact.format(cents / 100).replace(/ /g, ' ');
}

/**
 * Converte texto digitado pelo usuário em centavos.
 * Aceita "80", "80,5", "1.234,56", "R$ 1.234,56", "1234.56".
 * Retorna null quando o texto não é um valor válido.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" no formato brasileiro = mil duzentos e trinta e quatro
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

/** Valor em centavos para texto editável: 123456 -> "1.234,56". */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Divide um valor em N partes inteiras; a diferença de arredondamento fica na 1ª parcela. */
export function splitAmount(total: Cents, parts: number): Cents[] {
  if (parts < 1 || !Number.isInteger(parts)) throw new Error('Número de parcelas inválido');
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i === 0 ? base + remainder : base));
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}
