import { addMonthKey, makeDate, monthKey, parseISO, today } from './dates';
import { sum } from './money';
import type { Card, Cents, ISODate, InvoicePayment, MonthKey, Transaction } from './types';

/**
 * Regras de fatura:
 * - Compras feitas a partir do dia de fechamento entram no ciclo seguinte.
 * - A fatura é identificada pelo mês de VENCIMENTO ("fatura de novembro").
 * - Se o vencimento é depois do fechamento no calendário (fecha 5, vence 15), vence no mesmo mês do
 *   fechamento; caso contrário (fecha 28, vence 5), vence no mês seguinte.
 */
export function invoiceMonthFor(purchaseDate: ISODate, card: Pick<Card, 'closingDay' | 'dueDay'>): MonthKey {
  const { y, m, d } = parseISO(purchaseDate);
  const closingThisMonth = Math.min(card.closingDay, new Date(y, m, 0).getDate());
  const closingMonth = d >= closingThisMonth ? addMonthKey(monthKey(purchaseDate), 1) : monthKey(purchaseDate);
  return card.dueDay > card.closingDay ? closingMonth : addMonthKey(closingMonth, 1);
}

export function invoiceDueDate(invoice: MonthKey, card: Pick<Card, 'dueDay'>): ISODate {
  const { y, m } = parseISO(`${invoice}-01`);
  return makeDate(y, m, card.dueDay);
}

export function invoiceClosingDate(invoice: MonthKey, card: Pick<Card, 'closingDay' | 'dueDay'>): ISODate {
  const closingMonth = card.dueDay > card.closingDay ? invoice : addMonthKey(invoice, -1);
  const { y, m } = parseISO(`${closingMonth}-01`);
  return makeDate(y, m, card.closingDay);
}

export type InvoiceStatus = 'aberta' | 'fechada' | 'paga' | 'parcial' | 'vencida' | 'vazia';

export interface Invoice {
  cardId: string;
  month: MonthKey;
  closingDate: ISODate;
  dueDate: ISODate;
  items: Transaction[];
  total: Cents;
  paid: Cents;
  open: Cents;
  status: InvoiceStatus;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
  parcial: 'Paga parcialmente',
  vencida: 'Vencida',
  vazia: 'Sem compras',
};

export function buildInvoice(
  card: Card,
  month: MonthKey,
  transactions: Transaction[],
  invoicePayments: InvoicePayment[],
  ref: ISODate = today(),
): Invoice {
  const items = transactions
    .filter((t) => t.cardId === card.id && t.invoiceMonth === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = sum(items.map((t) => t.amount));
  const paid = sum(invoicePayments.filter((p) => p.cardId === card.id && p.invoiceMonth === month).map((p) => p.amount));
  const open = Math.max(0, total - paid);
  const closingDate = invoiceClosingDate(month, card);
  const dueDate = invoiceDueDate(month, card);
  let status: InvoiceStatus;
  if (total > 0 && open === 0) status = 'paga';
  // fatura sem nenhuma compra lançada não é "paga": só não tem nada registrado
  else if (total === 0) status = ref < closingDate ? 'aberta' : 'vazia';
  else if (ref > dueDate) status = 'vencida';
  else if (paid > 0) status = 'parcial';
  else if (ref >= closingDate) status = 'fechada';
  else status = 'aberta';
  return { cardId: card.id, month, closingDate, dueDate, items, total, paid, open, status };
}

/** Todas as faturas com movimento do cartão, em ordem cronológica. */
export function listInvoices(card: Card, transactions: Transaction[], invoicePayments: InvoicePayment[], ref?: ISODate): Invoice[] {
  const months = new Set<MonthKey>();
  transactions.forEach((t) => t.cardId === card.id && t.invoiceMonth && months.add(t.invoiceMonth));
  invoicePayments.forEach((p) => p.cardId === card.id && months.add(p.invoiceMonth));
  return [...months].sort().map((m) => buildInvoice(card, m, transactions, invoicePayments, ref));
}

/** Fatura atual = a que recebe compras feitas hoje. */
export function currentInvoiceMonth(card: Card, ref: ISODate = today()): MonthKey {
  return invoiceMonthFor(ref, card);
}

export interface CardUsage {
  used: Cents;
  available: Cents;
  usedPercent: number;
  /** Parcelas futuras já comprometidas (faturas após a atual). */
  futureInstallments: Cents;
}

/** Limite utilizado = tudo que foi comprado e ainda não foi pago (inclui parcelas futuras). */
export function cardUsage(card: Card, transactions: Transaction[], invoicePayments: InvoicePayment[], ref: ISODate = today()): CardUsage {
  const cardTx = transactions.filter((t) => t.cardId === card.id);
  const total = sum(cardTx.map((t) => t.amount));
  const paid = sum(invoicePayments.filter((p) => p.cardId === card.id).map((p) => p.amount));
  const used = Math.max(0, total - paid);
  const current = currentInvoiceMonth(card, ref);
  const futureInstallments = sum(cardTx.filter((t) => (t.invoiceMonth ?? '') > current).map((t) => t.amount));
  return {
    used,
    available: card.limit - used,
    usedPercent: card.limit > 0 ? (used / card.limit) * 100 : 0,
    futureInstallments,
  };
}

export interface InstallmentPlan {
  groupId: string;
  description: string;
  cardId?: string;
  totalAmount: Cents;
  total: number;
  paidCount: number;
  remainingAmount: Cents;
  nextInvoice?: MonthKey;
  lastInvoice?: MonthKey;
}

/** Acompanhamento de compras parceladas: quantas parcelas já passaram e quanto falta. */
export function installmentPlans(transactions: Transaction[], ref: ISODate = today()): InstallmentPlan[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.installment) continue;
    const list = groups.get(t.installment.groupId) ?? [];
    list.push(t);
    groups.set(t.installment.groupId, list);
  }
  const refMonth = monthKey(ref);
  return [...groups.entries()].map(([groupId, items]) => {
    items.sort((a, b) => a.installment!.number - b.installment!.number);
    const first = items[0];
    const done = items.filter((t) => (t.invoiceMonth ?? monthKey(t.date)) < refMonth);
    const pending = items.filter((t) => (t.invoiceMonth ?? monthKey(t.date)) >= refMonth);
    return {
      groupId,
      description: first.description.replace(/\s*\(\d+\/\d+\)$/, ''),
      cardId: first.cardId,
      totalAmount: first.installment!.totalAmount,
      total: first.installment!.total,
      paidCount: done.length,
      remainingAmount: sum(pending.map((t) => t.amount)),
      nextInvoice: pending[0]?.invoiceMonth,
      lastInvoice: items[items.length - 1].invoiceMonth,
    };
  });
}

export interface InvoiceChoice {
  month: MonthKey;
  dueDate: ISODate;
  automatic: boolean;
}

/**
 * Faturas que podem receber uma compra: a calculada pela data e as vizinhas.
 * Útil para lançar o saldo de uma fatura que já existia ou corrigir uma compra
 * que o banco colocou em outra fatura.
 */
export function invoiceChoices(card: Pick<Card, 'closingDay' | 'dueDay'>, purchaseDate: ISODate, include?: MonthKey): InvoiceChoice[] {
  const auto = invoiceMonthFor(purchaseDate, card);
  const months = new Set([-2, -1, 0, 1, 2].map((i) => addMonthKey(auto, i)));
  if (include) months.add(include);
  return [...months].sort().map((month) => ({ month, dueDate: invoiceDueDate(month, card), automatic: month === auto }));
}
