import { addMonths, diffDays, today } from './dates';
import { splitAmount, sum } from './money';
import type { BillOrigin, Card, Cents, ID, ISODate, MonthKey, Payment, PaymentMethod, Transaction, TxStatus, TxType } from './types';
import { invoiceMonthFor } from './cards';

export type IdFactory = () => ID;

export function paidAmount(t: Pick<Transaction, 'payments'>): Cents {
  return sum(t.payments.map((p) => p.amount));
}

export function openAmount(t: Pick<Transaction, 'payments' | 'amount'>): Cents {
  return Math.max(0, t.amount - paidAmount(t));
}

/** Compras no cartão de crédito não são pagas individualmente: entram na fatura. */
export function isCardTx(t: Pick<Transaction, 'cardId'>): boolean {
  return !!t.cardId;
}

export function txStatus(t: Pick<Transaction, 'payments' | 'amount' | 'cardId'>): TxStatus {
  if (isCardTx(t)) return 'pago';
  const paid = paidAmount(t);
  if (paid <= 0) return 'aberto';
  if (paid >= t.amount) return 'pago';
  return 'parcial';
}

export function isOverdue(t: Transaction, ref: ISODate = today()): boolean {
  return !isCardTx(t) && txStatus(t) !== 'pago' && t.date < ref;
}

export function daysOverdue(t: Transaction, ref: ISODate = today()): number {
  return isOverdue(t, ref) ? diffDays(ref, t.date) : 0;
}

export const STATUS_LABELS: Record<TxStatus, string> = {
  pago: 'Pago',
  parcial: 'Parcial',
  aberto: 'Em aberto',
};

export function statusLabel(t: Transaction, ref: ISODate = today()): string {
  if (isCardTx(t)) return 'Na fatura';
  const s = txStatus(t);
  if (s !== 'pago' && t.date < ref) return 'Vencido';
  if (t.type === 'receita') return s === 'pago' ? 'Recebido' : s === 'parcial' ? 'Parcial' : 'A receber';
  return STATUS_LABELS[s];
}

/** Dados mínimos de um lançamento rápido. */
export interface QuickEntryInput {
  type: TxType;
  description?: string;
  amount: Cents;
  date: ISODate;
  categoryId?: ID;
  subcategoryId?: ID;
  merchant?: string;
  paymentMethod: PaymentMethod;
  accountId?: ID;
  cardId?: ID;
  personId?: ID;
  /** Já pago/recebido no ato. */
  paid: boolean;
  notes?: string;
  installments?: number;
  /** Fatura da 1ª parcela escolhida manualmente; vazio = calculada pela data. */
  invoiceMonth?: MonthKey;
  recurrenceId?: ID;
  estimated?: boolean;
}

export function validateEntry(input: QuickEntryInput, card?: Card): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.push('Informe um valor maior que zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('Data inválida.');
  if (input.paymentMethod === 'credito') {
    if (input.type === 'receita') errors.push('Receitas não podem ser lançadas no cartão de crédito.');
    if (!input.cardId || !card) errors.push('Selecione o cartão de crédito.');
  }
  const n = input.installments ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 48) errors.push('Parcelas devem ficar entre 1 e 48.');
  if (n > 1 && input.paymentMethod !== 'credito') errors.push('Parcelamento disponível apenas no cartão de crédito.');
  return errors;
}

/** Descrição automática quando o usuário não digita nada. */
export function defaultDescription(input: QuickEntryInput, subcategoryName?: string, categoryName?: string): string {
  return (
    input.description?.trim() ||
    input.merchant?.trim() ||
    subcategoryName ||
    categoryName ||
    (input.type === 'receita' ? 'Receita' : 'Despesa')
  );
}

/**
 * Cria os lançamentos a partir de uma entrada rápida.
 * - Pagamento comum: 1 lançamento, com baixa total se `paid`.
 * - Cartão de crédito: N lançamentos (parcelas), cada um na sua fatura, sem baixa
 *   (a baixa acontece no pagamento da fatura e não gera nova despesa).
 */
export function buildTransactions(
  input: QuickEntryInput,
  newId: IdFactory,
  opts: { card?: Card; description: string; now?: string },
): Transaction[] {
  const errors = validateEntry(input, opts.card);
  if (errors.length) throw new Error(errors.join(' '));
  const createdAt = opts.now ?? new Date().toISOString();
  const base = {
    type: input.type,
    categoryId: input.categoryId || undefined,
    subcategoryId: input.subcategoryId || undefined,
    merchant: input.merchant?.trim() || undefined,
    paymentMethod: input.paymentMethod,
    personId: input.personId || undefined,
    notes: input.notes?.trim() || undefined,
    recurrenceId: input.recurrenceId,
    estimated: input.estimated || undefined,
    createdAt,
  };

  if (input.paymentMethod === 'credito' && opts.card) {
    const card = opts.card;
    const n = input.installments ?? 1;
    const parts = splitAmount(input.amount, n);
    const groupId = n > 1 ? newId() : undefined;
    const firstInvoice = input.invoiceMonth || invoiceMonthFor(input.date, card);
    const day = Number(input.date.slice(8, 10));
    return parts.map((amount, i) => ({
      ...base,
      id: newId(),
      description: n > 1 ? `${opts.description} (${i + 1}/${n})` : opts.description,
      amount,
      date: addMonths(input.date, i, day),
      cardId: card.id,
      accountId: undefined,
      invoiceMonth: addMonths(`${firstInvoice}-01`, i).slice(0, 7),
      payments: [],
      installment: groupId ? { groupId, number: i + 1, total: n, totalAmount: input.amount } : undefined,
    }));
  }

  const payments: Payment[] = input.paid
    ? [{ id: newId(), date: input.date, amount: input.amount, accountId: input.accountId }]
    : [];
  return [
    {
      ...base,
      id: newId(),
      description: opts.description,
      amount: input.amount,
      date: input.date,
      accountId: input.accountId || undefined,
      cardId: undefined,
      payments,
    },
  ];
}

/** Registra uma baixa (total ou parcial). Retorna o lançamento atualizado. */
export function addPayment(t: Transaction, payment: Payment): Transaction {
  if (isCardTx(t)) throw new Error('Compras no cartão são quitadas pelo pagamento da fatura.');
  if (payment.amount <= 0) throw new Error('O valor do pagamento deve ser maior que zero.');
  const open = openAmount(t);
  if (payment.amount > open) throw new Error('O pagamento é maior que o valor em aberto.');
  return { ...t, payments: [...t.payments, payment] };
}

/** Quita o saldo restante. */
export function settle(t: Transaction, newId: IdFactory, date: ISODate, accountId?: ID): Transaction {
  const open = openAmount(t);
  if (open <= 0) return t;
  return addPayment(t, { id: newId(), date, amount: open, accountId: accountId ?? t.accountId });
}

/** Desfaz todas as baixas, voltando o lançamento para "em aberto". */
export function reopen(t: Transaction): Transaction {
  return { ...t, payments: [] };
}

/**
 * Ajusta as baixas ao editar o valor de um lançamento já pago:
 * se estava totalmente pago, continua pago com o novo valor.
 */
export function applyAmountChange(t: Transaction, newAmount: Cents): Transaction {
  const wasPaid = txStatus(t) === 'pago' && !isCardTx(t);
  if (wasPaid && t.payments.length === 1) {
    return { ...t, amount: newAmount, payments: [{ ...t.payments[0], amount: newAmount }] };
  }
  return { ...t, amount: newAmount };
}

export interface PayWithCardOptions {
  card: Card;
  /** Data em que a conta foi passada no cartão (define a fatura automática). */
  date: ISODate;
  /** Fatura escolhida manualmente; vazio = calculada pela data. */
  invoiceMonth?: MonthKey;
  installments?: number;
}

/**
 * Paga uma conta em aberto com o cartão de crédito: o saldo em aberto vira compra
 * na fatura (com parcelas, se houver) e sai de "contas a pagar". Nada é duplicado:
 * - sem baixa anterior: o próprio lançamento vira a compra (mantém id, categoria e comprovantes);
 * - com baixa parcial: o que já foi pago fica no lançamento original e só o restante vai para o cartão.
 */
export function payWithCard(t: Transaction, opts: PayWithCardOptions, newId: IdFactory): { updated?: Transaction; created: Transaction[] } {
  if (t.type !== 'despesa') throw new Error('Só despesas podem ser pagas com cartão de crédito.');
  if (isCardTx(t)) throw new Error('Este lançamento já está no cartão.');
  const open = openAmount(t);
  if (open <= 0) throw new Error('Esta conta já está paga.');
  const description = t.description.replace(/\s*\(\d+\/\d+\)$/, '');
  const [first, ...rest] = buildTransactions(
    {
      type: 'despesa',
      amount: open,
      date: opts.date,
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      merchant: t.merchant,
      paymentMethod: 'credito',
      cardId: opts.card.id,
      personId: t.personId,
      notes: t.notes,
      paid: true,
      installments: opts.installments ?? 1,
      invoiceMonth: opts.invoiceMonth,
      recurrenceId: t.recurrenceId,
    },
    newId,
    { card: opts.card, description, now: t.createdAt },
  );
  const billOrigin: BillOrigin = {
    billId: t.id,
    amount: t.amount,
    date: t.date,
    paymentMethod: t.paymentMethod,
    accountId: t.accountId,
    description: t.description,
    estimated: t.estimated,
  };
  const withOrigin = (x: Transaction): Transaction => ({ ...x, billOrigin });
  if (t.payments.length === 0) {
    // reaproveita o id: comprovantes e vínculos continuam apontando para o mesmo lançamento
    return { updated: withOrigin({ ...first, id: t.id, estimated: undefined }), created: rest.map(withOrigin) };
  }
  const paid = paidAmount(t);
  return { updated: { ...t, amount: paid, estimated: undefined }, created: [first, ...rest].map(withOrigin) };
}

/**
 * Desfaz o pagamento no cartão: junta a compra (e todas as parcelas) de volta numa
 * conta a pagar em aberto. Funciona também para compras no cartão lançadas direto
 * (sem `billOrigin`), que viram uma conta em aberto com o valor total.
 */
export function cardPaymentToBill(all: Transaction[], tx: Transaction): { put: Transaction; deleteIds: ID[] } {
  if (!isCardTx(tx)) throw new Error('Este lançamento não está no cartão.');
  const origin = tx.billOrigin;
  const group = origin
    ? all.filter((x) => x.billOrigin?.billId === origin.billId && isCardTx(x))
    : tx.installment
      ? all.filter((x) => x.installment?.groupId === tx.installment!.groupId)
      : [tx];
  group.sort((a, b) => (a.installment?.number ?? 0) - (b.installment?.number ?? 0));
  const cardTotal = sum(group.map((x) => x.amount));
  const billId = origin?.billId ?? group[0].id;
  // conta que tinha pagamento parcial: o original ficou fora do cartão, só devolve o restante a ele
  const original = all.find((x) => x.id === billId && !isCardTx(x));
  if (original) {
    return {
      put: { ...original, amount: original.amount + cardTotal, estimated: origin?.estimated },
      deleteIds: group.map((x) => x.id),
    };
  }
  const base = group.find((x) => x.id === billId) ?? group[0];
  return {
    put: {
      ...base,
      id: billId,
      amount: origin?.amount ?? cardTotal,
      date: origin?.date ?? base.date,
      paymentMethod: origin?.paymentMethod ?? 'boleto',
      accountId: origin?.accountId,
      description: origin?.description ?? base.description.replace(/\s*\(\d+\/\d+\)$/, ''),
      estimated: origin?.estimated,
      cardId: undefined,
      invoiceMonth: undefined,
      installment: undefined,
      billOrigin: undefined,
      payments: [],
    },
    deleteIds: group.map((x) => x.id).filter((id) => id !== billId),
  };
}
