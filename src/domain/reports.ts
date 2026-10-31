import { totalBalance } from './accounts';
import { buildInvoice } from './cards';
import { addMonthKey, isBetween, monthKey, monthRange, today } from './dates';
import { sum } from './money';
import { isCardTx, openAmount, paidAmount, txStatus } from './transactions';
import type {
  Account,
  Budget,
  Card,
  Category,
  Cents,
  ID,
  ISODate,
  InvoicePayment,
  MonthKey,
  Subcategory,
  Transaction,
  Transfer,
  TxType,
} from './types';

export interface DataSet {
  transactions: Transaction[];
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  cards: Card[];
  invoicePayments: InvoicePayment[];
  transfers: Transfer[];
  budgets: Budget[];
}

// ---------------------------------------------------------------- filtros

export interface TxFilters {
  from?: ISODate;
  to?: ISODate;
  type?: TxType | '';
  categoryId?: ID;
  subcategoryId?: ID;
  merchant?: string;
  personId?: ID;
  cardId?: ID;
  accountId?: ID;
  status?: 'pago' | 'aberto' | 'vencido' | '';
  search?: string;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function filterTransactions(txs: Transaction[], f: TxFilters, cards: Card[] = [], ref: ISODate = today()): Transaction[] {
  const holderByCard = new Map(cards.map((c) => [c.id, c.holderId]));
  const search = f.search ? normalize(f.search) : '';
  const merchant = f.merchant ? normalize(f.merchant) : '';
  return txs.filter((t) => {
    if (!isBetween(t.date, f.from, f.to)) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.subcategoryId && t.subcategoryId !== f.subcategoryId) return false;
    if (merchant && normalize(t.merchant ?? '') !== merchant) return false;
    if (f.personId) {
      const person = t.personId ?? (t.cardId ? holderByCard.get(t.cardId) : undefined);
      if (person !== f.personId) return false;
    }
    if (f.cardId && t.cardId !== f.cardId) return false;
    if (f.accountId && t.accountId !== f.accountId && !t.payments.some((p) => p.accountId === f.accountId)) return false;
    if (f.status) {
      const s = txStatus(t);
      if (f.status === 'pago' && s !== 'pago') return false;
      if (f.status === 'aberto' && s === 'pago') return false;
      if (f.status === 'vencido' && (s === 'pago' || t.date >= ref)) return false;
    }
    if (search) {
      const hay = normalize(`${t.description} ${t.merchant ?? ''} ${t.notes ?? ''}`);
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- agrupamentos

export interface GroupTotal {
  key: string;
  label: string;
  total: Cents;
  count: number;
  color?: string;
  percent: number;
}

export function groupTotals(
  txs: Transaction[],
  keyOf: (t: Transaction) => string | undefined,
  labelOf: (key: string) => string,
  colorOf?: (key: string) => string | undefined,
): GroupTotal[] {
  const map = new Map<string, { total: Cents; count: number }>();
  for (const t of txs) {
    const key = keyOf(t) ?? '__none__';
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  const grand = sum([...map.values()].map((v) => v.total));
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: key === '__none__' ? 'Sem classificação' : labelOf(key),
      total: v.total,
      count: v.count,
      color: colorOf?.(key),
      percent: grand ? (v.total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function byCategory(txs: Transaction[], categories: Category[]): GroupTotal[] {
  const cat = new Map(categories.map((c) => [c.id, c]));
  return groupTotals(
    txs,
    (t) => t.categoryId,
    (k) => cat.get(k)?.name ?? 'Categoria removida',
    (k) => cat.get(k)?.color,
  );
}

export function bySubcategory(txs: Transaction[], categories: Category[], subcategories: Subcategory[]): GroupTotal[] {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const sub = new Map(subcategories.map((s) => [s.id, s]));
  return groupTotals(
    txs,
    (t) => (t.subcategoryId ? t.subcategoryId : t.categoryId ? `cat:${t.categoryId}` : undefined),
    (k) => {
      if (k.startsWith('cat:')) return `${cat.get(k.slice(4))?.name ?? '?'} (sem subcategoria)`;
      const s = sub.get(k);
      return s ? `${cat.get(s.categoryId)?.name ?? '?'} › ${s.name}` : 'Subcategoria removida';
    },
    (k) => cat.get(k.startsWith('cat:') ? k.slice(4) : (sub.get(k)?.categoryId ?? ''))?.color,
  );
}

export function byMerchant(txs: Transaction[]): GroupTotal[] {
  const display = new Map<string, string>();
  return groupTotals(
    txs.filter((t) => t.merchant),
    (t) => {
      const k = normalize(t.merchant!);
      if (!display.has(k)) display.set(k, t.merchant!);
      return k;
    },
    (k) => display.get(k) ?? k,
  );
}

export function byCard(txs: Transaction[], cards: Card[]): GroupTotal[] {
  const map = new Map(cards.map((c) => [c.id, c]));
  return groupTotals(
    txs.filter((t) => t.cardId),
    (t) => t.cardId,
    (k) => map.get(k)?.name ?? 'Cartão removido',
    (k) => map.get(k)?.color,
  );
}

// ---------------------------------------------------------------- resumo do mês

export interface MonthSummary {
  month: MonthKey;
  income: Cents;
  received: Cents;
  toReceive: Cents;
  expenses: Cents;
  /** Pago de contas do mês (inclui faturas com vencimento no mês). */
  paid: Cents;
  /** Ainda a pagar no mês (contas + faturas com vencimento no mês). */
  toPay: Cents;
  /** Vencidos de meses anteriores ainda em aberto. */
  overduePrevious: Cents;
  overdueReceivablePrevious: Cents;
  balance: Cents;
  available: Cents;
  /** Saldo disponível + a receber - a pagar. */
  projectedEnd: Cents;
  result: Cents;
  topCategory?: GroupTotal;
  previous: { income: Cents; expenses: Cents };
  expenseChange: number | null;
  incomeChange: number | null;
}

const inMonth = (t: Transaction, m: MonthKey) => monthKey(t.date) === m;

export function expensesOf(txs: Transaction[], month?: MonthKey): Transaction[] {
  return txs.filter((t) => t.type === 'despesa' && (!month || inMonth(t, month)));
}

export function incomesOf(txs: Transaction[], month?: MonthKey): Transaction[] {
  return txs.filter((t) => t.type === 'receita' && (!month || inMonth(t, month)));
}

function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function monthSummary(data: DataSet, month: MonthKey, ref: ISODate = today()): MonthSummary {
  const txs = data.transactions;
  const incomes = incomesOf(txs, month);
  const expenses = expensesOf(txs, month);
  const nonCardExpenses = expenses.filter((t) => !isCardTx(t));

  const invoices = data.cards.map((c) => buildInvoice(c, month, txs, data.invoicePayments, ref));
  const invoicesPaid = sum(invoices.map((i) => i.paid));
  const invoicesOpen = sum(invoices.map((i) => i.open));

  const monthStartDate = `${month}-01`;
  const overduePrevious = sum(
    txs.filter((t) => t.type === 'despesa' && !isCardTx(t) && t.date < monthStartDate && t.date < ref).map(openAmount),
  );
  const overdueInvoices = sum(
    data.cards.flatMap((c) => {
      const months = new Set(txs.filter((t) => t.cardId === c.id && t.invoiceMonth && t.invoiceMonth < month).map((t) => t.invoiceMonth!));
      return [...months].map((m) => buildInvoice(c, m, txs, data.invoicePayments, ref).open);
    }),
  );
  const overdueReceivablePrevious = sum(txs.filter((t) => t.type === 'receita' && t.date < monthStartDate).map(openAmount));

  const income = sum(incomes.map((t) => t.amount));
  const received = sum(incomes.map(paidAmount));
  const toReceive = sum(incomes.map(openAmount));
  const expenseTotal = sum(expenses.map((t) => t.amount));
  const paid = sum(nonCardExpenses.map(paidAmount)) + invoicesPaid;
  const toPay = sum(nonCardExpenses.map(openAmount)) + invoicesOpen;

  const available = totalBalance(data.accounts, data, ref);
  const projectedEnd = available + toReceive + overdueReceivablePrevious - toPay - overduePrevious - overdueInvoices;

  const prevMonth = addMonthKey(month, -1);
  const prevIncome = sum(incomesOf(txs, prevMonth).map((t) => t.amount));
  const prevExpenses = sum(expensesOf(txs, prevMonth).map((t) => t.amount));

  return {
    month,
    income,
    received,
    toReceive,
    expenses: expenseTotal,
    paid,
    toPay,
    overduePrevious: overduePrevious + overdueInvoices,
    overdueReceivablePrevious,
    balance: income - expenseTotal,
    available,
    projectedEnd,
    result: income - expenseTotal,
    topCategory: byCategory(expenses, data.categories)[0],
    previous: { income: prevIncome, expenses: prevExpenses },
    expenseChange: change(expenseTotal, prevExpenses),
    incomeChange: change(income, prevIncome),
  };
}

// ---------------------------------------------------------------- evolução e comparações

export interface MonthPoint {
  month: MonthKey;
  income: Cents;
  expenses: Cents;
  result: Cents;
  accumulated: Cents;
}

export function monthlyEvolution(txs: Transaction[], from: MonthKey, to: MonthKey): MonthPoint[] {
  let acc = 0;
  return monthRange(from, to).map((m) => {
    const income = sum(incomesOf(txs, m).map((t) => t.amount));
    const expenses = sum(expensesOf(txs, m).map((t) => t.amount));
    acc += income - expenses;
    return { month: m, income, expenses, result: income - expenses, accumulated: acc };
  });
}

export interface CategoryComparison {
  categoryId: string;
  name: string;
  color?: string;
  current: Cents;
  previous: Cents;
  diff: Cents;
  diffPercent: number | null;
}

/** Compara gastos por categoria entre dois períodos. */
export function compareCategories(
  txs: Transaction[],
  categories: Category[],
  current: { from: ISODate; to: ISODate },
  previous: { from: ISODate; to: ISODate },
): CategoryComparison[] {
  const exp = txs.filter((t) => t.type === 'despesa');
  const cur = byCategory(filterTransactions(exp, current), categories);
  const prev = byCategory(filterTransactions(exp, previous), categories);
  const keys = new Set([...cur.map((g) => g.key), ...prev.map((g) => g.key)]);
  const cmap = new Map(cur.map((g) => [g.key, g]));
  const pmap = new Map(prev.map((g) => [g.key, g]));
  return [...keys]
    .map((k) => {
      const c = cmap.get(k)?.total ?? 0;
      const p = pmap.get(k)?.total ?? 0;
      const g = cmap.get(k) ?? pmap.get(k)!;
      return { categoryId: k, name: g.label, color: g.color, current: c, previous: p, diff: c - p, diffPercent: change(c, p) };
    })
    .sort((a, b) => b.diff - a.diff);
}

export function topExpenses(txs: Transaction[], limit = 10): Transaction[] {
  return txs
    .filter((t) => t.type === 'despesa')
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export interface DetectedRecurring {
  merchant: string;
  months: number;
  average: Cents;
  last: ISODate;
}

/** Descobre gastos que se repetem (mesmo estabelecimento em 3+ meses distintos) e ainda não são recorrências cadastradas. */
export function detectRecurring(txs: Transaction[], minMonths = 3): DetectedRecurring[] {
  const map = new Map<string, { name: string; months: Set<string>; amounts: number[]; last: ISODate }>();
  for (const t of txs) {
    if (t.type !== 'despesa' || !t.merchant || t.recurrenceId || t.installment) continue;
    const k = normalize(t.merchant);
    const cur = map.get(k) ?? { name: t.merchant, months: new Set(), amounts: [], last: t.date };
    cur.months.add(monthKey(t.date));
    cur.amounts.push(t.amount);
    if (t.date > cur.last) cur.last = t.date;
    map.set(k, cur);
  }
  return [...map.values()]
    .filter((v) => v.months.size >= minMonths)
    .map((v) => ({
      merchant: v.name,
      months: v.months.size,
      average: Math.round((sum(v.amounts) / v.months.size)),
      last: v.last,
    }))
    .sort((a, b) => b.average - a.average);
}

// ---------------------------------------------------------------- orçamento

export type BudgetLevel = 'ok' | 'alerta' | 'estourado';

export interface BudgetStatus {
  budget: Budget;
  category?: Category;
  spent: Cents;
  remaining: Cents;
  percent: number;
  level: BudgetLevel;
}

export function budgetLevel(percent: number): BudgetLevel {
  if (percent >= 100) return 'estourado';
  if (percent >= 80) return 'alerta';
  return 'ok';
}

export function budgetStatus(data: Pick<DataSet, 'budgets' | 'categories' | 'transactions'>, month: MonthKey): BudgetStatus[] {
  const expenses = expensesOf(data.transactions, month);
  return data.budgets
    .map((b) => {
      const spent = sum(expenses.filter((t) => t.categoryId === b.categoryId).map((t) => t.amount));
      const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      return {
        budget: b,
        category: data.categories.find((c) => c.id === b.categoryId),
        spent,
        remaining: b.amount - spent,
        percent,
        level: budgetLevel(percent),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

// ---------------------------------------------------------------- oportunidades de economia

export interface SavingOpportunity {
  categoryId: string;
  name: string;
  color?: string;
  essential: boolean;
  current: Cents;
  average: Cents;
  increase: Cents;
  increasePercent: number | null;
  /** Média mensal dos últimos meses, base para simular reduções. */
  baseMonthly: Cents;
  topSubcategory?: string;
  topMerchant?: string;
  reason: string;
}

/**
 * Compara o mês com a média dos `lookback` meses anteriores e aponta categorias que
 * cresceram ou que não são essenciais (candidatas a redução).
 */
export function savingOpportunities(data: Pick<DataSet, 'transactions' | 'categories' | 'subcategories'>, month: MonthKey, lookback = 3): SavingOpportunity[] {
  const expenses = data.transactions.filter((t) => t.type === 'despesa');
  const prevMonths = monthRange(addMonthKey(month, -lookback), addMonthKey(month, -1));
  const out: SavingOpportunity[] = [];
  for (const c of data.categories.filter((c) => c.type === 'despesa')) {
    const catTx = expenses.filter((t) => t.categoryId === c.id);
    const current = sum(catTx.filter((t) => inMonth(t, month)).map((t) => t.amount));
    const monthsWithData = prevMonths.filter((m) => catTx.some((t) => inMonth(t, m)));
    const prevTotal = sum(catTx.filter((t) => prevMonths.includes(monthKey(t.date))).map((t) => t.amount));
    const average = monthsWithData.length ? Math.round(prevTotal / monthsWithData.length) : 0;
    const baseMonthly = Math.round((prevTotal + current) / (monthsWithData.length + (current > 0 ? 1 : 0) || 1));
    if (current === 0 && average === 0) continue;
    const increase = current - average;
    const increasePercent = change(current, average);
    const grew = average > 0 && increase > 0 && (increasePercent ?? 0) >= 10;
    if (!grew && c.essential) continue;
    const monthTx = catTx.filter((t) => inMonth(t, month));
    const topSub = bySubcategory(monthTx, data.categories, data.subcategories)[0];
    const topMerchant = byMerchant(monthTx)[0];
    out.push({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      essential: c.essential,
      current,
      average,
      increase,
      increasePercent,
      baseMonthly,
      topSubcategory: topSub?.label.split(' › ')[1],
      topMerchant: topMerchant?.label,
      reason: grew
        ? `Gasto ${Math.round(increasePercent ?? 0)}% acima da média dos últimos meses`
        : 'Gasto não essencial — bom candidato a redução',
    });
  }
  return out.sort((a, b) => b.increase - a.increase || b.current - a.current);
}

/** Economia mensal estimada ao reduzir cada categoria por um percentual. */
export function simulateSavings(items: { baseMonthly: Cents; reductionPercent: number }[]): Cents {
  return sum(items.map((i) => Math.round((i.baseMonthly * Math.min(Math.max(i.reductionPercent, 0), 100)) / 100)));
}
