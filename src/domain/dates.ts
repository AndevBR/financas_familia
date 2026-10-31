import type { ISODate, MonthKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISO(new Date());
}

export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Monta uma data limitando o dia ao último dia do mês (31/02 -> 28 ou 29/02). */
export function makeDate(y: number, m: number, d: number): ISODate {
  // normaliza mês fora de 1..12
  const total = y * 12 + (m - 1);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(Math.max(d, 1), daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

export function addMonths(date: ISODate, months: number, preferredDay?: number): ISODate {
  const { y, m, d } = parseISO(date);
  return makeDate(y, m + months, preferredDay ?? d);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(date);
  return toISO(new Date(y, m - 1, d + days));
}

export function addYears(date: ISODate, years: number, preferredDay?: number): ISODate {
  return addMonths(date, years * 12, preferredDay);
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function currentMonth(): MonthKey {
  return monthKey(today());
}

export function addMonthKey(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${key}-01`, months));
}

export function monthStart(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): ISODate {
  const { y, m } = parseISO(`${key}-01`);
  return makeDate(y, m, 31);
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  let k = from;
  while (k <= to && out.length < 600) {
    out.push(k);
    k = addMonthKey(k, 1);
  }
  return out;
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ta - tb) / 86_400_000);
}

export function isBetween(date: ISODate, from?: ISODate, to?: ISODate): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** "2026-10-31" -> "31/10/2026" */
export function formatDateBR(date?: ISODate): string {
  if (!date) return '';
  const { y, m, d } = parseISO(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function formatDateShort(date: ISODate): string {
  const { m, d } = parseISO(date);
  return `${pad(d)}/${pad(m)}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10" -> "outubro de 2026" */
export function formatMonth(key: MonthKey): string {
  const { y, m } = parseISO(`${key}-01`);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "2026-10" -> "out/26" */
export function formatMonthShort(key: MonthKey): string {
  const { y, m } = parseISO(`${key}-01`);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}
