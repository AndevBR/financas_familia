import { invoiceMonthFor } from './cards';
import { addDays, addMonths, addYears, parseISO } from './dates';
import type { Card, ISODate, Recurrence, Transaction } from './types';
import type { IdFactory } from './transactions';

/** Datas de ocorrência de uma recorrência dentro do intervalo [from, to]. */
export function occurrences(rec: Pick<Recurrence, 'frequency' | 'startDate' | 'endDate'>, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const end = rec.endDate && rec.endDate < to ? rec.endDate : to;
  const day = parseISO(rec.startDate).d;
  for (let i = 0; i < 2000; i++) {
    const date =
      rec.frequency === 'semanal'
        ? addDays(rec.startDate, i * 7)
        : rec.frequency === 'mensal'
          ? addMonths(rec.startDate, i, day)
          : addYears(rec.startDate, i, day);
    if (date > end) break;
    if (date >= from) out.push(date);
  }
  return out;
}

export function nextOccurrence(rec: Recurrence, after: ISODate): ISODate | undefined {
  if (rec.state !== 'ativa') return undefined;
  const limit = addYears(after, 2);
  return occurrences(rec, addDays(after, 1), limit)[0];
}

/**
 * Gera os lançamentos pendentes de uma recorrência até `horizon`, sem duplicar
 * ocorrências já geradas (controle por `generatedUntil`).
 */
export function generateRecurrence(
  rec: Recurrence,
  horizon: ISODate,
  newId: IdFactory,
  cards: Card[] = [],
  now = new Date().toISOString(),
): { transactions: Transaction[]; generatedUntil: ISODate | undefined } {
  if (rec.state !== 'ativa') return { transactions: [], generatedUntil: rec.generatedUntil };
  const from = rec.generatedUntil ? addDays(rec.generatedUntil, 1) : rec.startDate;
  if (from > horizon) return { transactions: [], generatedUntil: rec.generatedUntil };
  const dates = occurrences(rec, from, horizon);
  const card = rec.paymentMethod === 'credito' ? cards.find((c) => c.id === rec.cardId) : undefined;
  const transactions: Transaction[] = dates.map((date) => ({
    id: newId(),
    type: rec.type,
    description: rec.description,
    amount: rec.amount,
    date,
    categoryId: rec.categoryId,
    subcategoryId: rec.subcategoryId,
    merchant: rec.merchant,
    paymentMethod: rec.paymentMethod,
    accountId: card ? undefined : rec.accountId,
    cardId: card?.id,
    invoiceMonth: card ? invoiceMonthFor(date, card) : undefined,
    personId: rec.personId,
    payments: !card && rec.autoPay ? [{ id: newId(), date, amount: rec.amount, accountId: rec.accountId }] : [],
    recurrenceId: rec.id,
    estimated: rec.variableAmount || undefined,
    createdAt: now,
  }));
  return { transactions, generatedUntil: horizon };
}

/** Ao reativar uma recorrência pausada, não gera retroativamente o período pausado. */
export function resumeRecurrence(rec: Recurrence, ref: ISODate): Recurrence {
  const yesterday = addDays(ref, -1);
  const generatedUntil = !rec.generatedUntil || rec.generatedUntil < yesterday ? yesterday : rec.generatedUntil;
  return { ...rec, state: 'ativa', generatedUntil };
}

/** Valor mensal equivalente (para somar recorrências com frequências diferentes). */
export function monthlyEquivalent(rec: Pick<Recurrence, 'amount' | 'frequency'>): number {
  if (rec.frequency === 'semanal') return Math.round((rec.amount * 52) / 12);
  if (rec.frequency === 'anual') return Math.round(rec.amount / 12);
  return rec.amount;
}
