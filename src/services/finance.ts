// Operações que gravam no banco. Toda regra de cálculo fica em src/domain;
// aqui apenas orquestramos leitura/escrita de forma atômica.
import { db as defaultDb, newId, type FinanceDB } from '../db/database';
import { invoiceMonthFor } from '../domain/cards';
import { addMonthKey, monthEnd, today } from '../domain/dates';
import { seedCategories } from '../domain/defaults';
import { generateRecurrence, resumeRecurrence } from '../domain/recurrence';
import {
  addPayment,
  applyAmountChange,
  buildTransactions,
  defaultDescription,
  isCardTx,
  reopen,
  settle,
  type QuickEntryInput,
} from '../domain/transactions';
import { rememberMerchant } from '../domain/suggestions';
import { validateTransfer } from '../domain/accounts';
import type { Account, Budget, Card, Category, Cents, ID, ISODate, InvoicePayment, Person, Recurrence, Subcategory, Transaction, Transfer } from '../domain/types';

// ---------------------------------------------------------------- inicialização

export async function ensureSeed(db: FinanceDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.categories, db.subcategories, db.accounts, db.people, db.settings], async () => {
    if (await db.settings.get('app')) return;
    const { categories, subcategories } = seedCategories(newId);
    await db.categories.bulkAdd(categories);
    await db.subcategories.bulkAdd(subcategories);
    await db.people.bulkAdd([
      { id: newId(), name: 'Responsável 1' },
      { id: newId(), name: 'Responsável 2' },
    ]);
    await db.accounts.bulkAdd([
      { id: newId(), name: 'Conta principal', type: 'banco', initialBalance: 0, color: '#0f766e' },
      { id: newId(), name: 'Dinheiro', type: 'dinheiro', initialBalance: 0, color: '#22c55e' },
    ]);
    await db.settings.put({ id: 'app', theme: 'sistema' });
  });
}

// ---------------------------------------------------------------- lançamentos

export async function saveQuickEntry(input: QuickEntryInput, db: FinanceDB = defaultDb): Promise<Transaction[]> {
  const [card, sub, cat, merchants] = await Promise.all([
    input.cardId ? db.cards.get(input.cardId) : undefined,
    input.subcategoryId ? db.subcategories.get(input.subcategoryId) : undefined,
    input.categoryId ? db.categories.get(input.categoryId) : undefined,
    db.merchants.toArray(),
  ]);
  const description = defaultDescription(input, sub?.name, cat?.name);
  const txs = buildTransactions(input, newId, { card, description });
  const merchant = rememberMerchant(merchants, { ...input, merchant: input.merchant }, newId);
  await db.transaction('rw', db.transactions, db.merchants, async () => {
    await db.transactions.bulkAdd(txs);
    if (merchant) await db.merchants.put(merchant);
  });
  return txs;
}

export interface TxEdit {
  description: string;
  amount: Cents;
  date: ISODate;
  categoryId?: ID;
  subcategoryId?: ID;
  merchant?: string;
  paymentMethod: Transaction['paymentMethod'];
  accountId?: ID;
  cardId?: ID;
  personId?: ID;
  notes?: string;
  paid?: boolean;
}

/** Edita um lançamento existente (uma parcela por vez no caso de parcelados). */
export async function updateTransaction(id: ID, edit: TxEdit, db: FinanceDB = defaultDb): Promise<void> {
  const t = await db.transactions.get(id);
  if (!t) throw new Error('Lançamento não encontrado.');
  if (!(edit.amount > 0)) throw new Error('Informe um valor maior que zero.');
  let next: Transaction = applyAmountChange(t, edit.amount);
  const card = edit.paymentMethod === 'credito' && edit.cardId ? await db.cards.get(edit.cardId) : undefined;
  if (edit.paymentMethod === 'credito' && !card) throw new Error('Selecione o cartão de crédito.');
  next = {
    ...next,
    description: edit.description.trim() || t.description,
    date: edit.date,
    categoryId: edit.categoryId || undefined,
    subcategoryId: edit.subcategoryId || undefined,
    merchant: edit.merchant?.trim() || undefined,
    paymentMethod: edit.paymentMethod,
    personId: edit.personId || undefined,
    notes: edit.notes?.trim() || undefined,
    estimated: t.estimated && edit.amount === t.amount ? t.estimated : undefined,
  };
  if (card) {
    // parcelas mantêm a fatura original, compras à vista seguem a data
    next = {
      ...next,
      cardId: card.id,
      accountId: undefined,
      payments: [],
      invoiceMonth: t.cardId === card.id && t.installment ? t.invoiceMonth : invoiceMonthFor(edit.date, card),
    };
  } else {
    next = { ...next, cardId: undefined, invoiceMonth: undefined, accountId: edit.accountId || undefined };
    if (t.cardId && edit.paid === undefined) next.payments = [];
    if (edit.paid === false) next.payments = [];
    if (edit.paid === true) next = settle(next, newId, next.payments.length ? today() : edit.date, next.accountId);
    // conta alterada em lançamento pago à vista: acompanha a baixa
    if (next.payments.length === 1 && next.payments[0].amount === next.amount) next.payments = [{ ...next.payments[0], accountId: next.accountId }];
  }
  const merchants = await db.merchants.toArray();
  const merchant = rememberMerchant(merchants, next, newId);
  await db.transaction('rw', db.transactions, db.merchants, async () => {
    await db.transactions.put(next);
    if (merchant) await db.merchants.put({ ...merchant, usageCount: Math.max(1, merchant.usageCount - 1) });
  });
}

/** Exclui um lançamento; com `wholeGroup` remove todas as parcelas da compra. */
export async function deleteTransaction(id: ID, opts: { wholeGroup?: boolean } = {}, db: FinanceDB = defaultDb): Promise<number> {
  const t = await db.transactions.get(id);
  if (!t) return 0;
  if (opts.wholeGroup && t.installment) {
    const ids = (await db.transactions.where('installment.groupId').equals(t.installment.groupId).primaryKeys()) as string[];
    await db.transaction('rw', db.transactions, db.attachments, async () => {
      await db.transactions.bulkDelete(ids);
      await db.attachments.where('transactionId').anyOf(ids).delete();
    });
    return ids.length;
  }
  await db.transaction('rw', db.transactions, db.attachments, async () => {
    await db.transactions.delete(id);
    await db.attachments.where('transactionId').equals(id).delete();
  });
  return 1;
}

/** Registra uma baixa e devolve o id do pagamento (para vincular o comprovante). */
export async function registerPayment(id: ID, amount: Cents, date: ISODate, accountId: ID | undefined, db: FinanceDB = defaultDb): Promise<ID> {
  const t = await db.transactions.get(id);
  if (!t) throw new Error('Lançamento não encontrado.');
  const paymentId = newId();
  await db.transactions.put(addPayment(t, { id: paymentId, amount, date, accountId }));
  return paymentId;
}

export async function settleTransaction(id: ID, date: ISODate = today(), accountId?: ID, db: FinanceDB = defaultDb) {
  const t = await db.transactions.get(id);
  if (!t) throw new Error('Lançamento não encontrado.');
  if (isCardTx(t)) throw new Error('Compras no cartão são quitadas pelo pagamento da fatura.');
  await db.transactions.put({ ...settle(t, newId, date, accountId), estimated: undefined });
}

export async function reopenTransaction(id: ID, db: FinanceDB = defaultDb) {
  const t = await db.transactions.get(id);
  if (t) await db.transactions.put(reopen(t));
}

// ---------------------------------------------------------------- cartões

export async function payInvoice(p: Omit<InvoicePayment, 'id'>, db: FinanceDB = defaultDb): Promise<InvoicePayment> {
  if (!(p.amount > 0)) throw new Error('Informe um valor maior que zero.');
  const payment = { ...p, id: newId() };
  await db.invoicePayments.add(payment);
  return payment;
}

export async function deleteInvoicePayment(id: ID, db: FinanceDB = defaultDb) {
  await db.transaction('rw', db.invoicePayments, db.attachments, async () => {
    await db.invoicePayments.delete(id);
    await db.attachments.where('invoicePaymentId').equals(id).delete();
  });
}

export async function saveCard(card: Omit<Card, 'id'> & { id?: ID }, db: FinanceDB = defaultDb) {
  if (!card.name.trim()) throw new Error('Informe o nome do cartão.');
  if (card.closingDay < 1 || card.closingDay > 31 || card.dueDay < 1 || card.dueDay > 31) throw new Error('Dias de fechamento e vencimento devem estar entre 1 e 31.');
  await db.cards.put({ ...card, id: card.id ?? newId() } as Card);
}

/** Exclui o cartão e as compras/pagamentos de fatura vinculados. */
export async function deleteCard(id: ID, db: FinanceDB = defaultDb) {
  await db.transaction('rw', [db.cards, db.transactions, db.invoicePayments, db.attachments], async () => {
    const txIds = (await db.transactions.where('cardId').equals(id).primaryKeys()) as string[];
    const payIds = (await db.invoicePayments.where('cardId').equals(id).primaryKeys()) as string[];
    await db.attachments.where('transactionId').anyOf(txIds).delete();
    await db.attachments.where('invoicePaymentId').anyOf(payIds).delete();
    await db.transactions.bulkDelete(txIds);
    await db.invoicePayments.bulkDelete(payIds);
    await db.cards.delete(id);
  });
}

// ---------------------------------------------------------------- categorias

export async function saveCategory(cat: Omit<Category, 'id' | 'order'> & { id?: ID; order?: number }, db: FinanceDB = defaultDb) {
  if (!cat.name.trim()) throw new Error('Informe o nome da categoria.');
  const order = cat.order ?? (await db.categories.count());
  const id = cat.id ?? newId();
  await db.categories.put({ ...cat, name: cat.name.trim(), id, order });
  return id;
}

export async function saveSubcategory(sub: Omit<Subcategory, 'id'> & { id?: ID }, db: FinanceDB = defaultDb) {
  if (!sub.name.trim()) throw new Error('Informe o nome da subcategoria.');
  const id = sub.id ?? newId();
  await db.subcategories.put({ ...sub, name: sub.name.trim(), id });
  return id;
}

/** Exclui a categoria; os lançamentos ficam "sem classificação" (não são apagados). */
export async function deleteCategory(id: ID, db: FinanceDB = defaultDb) {
  await db.transaction('rw', [db.categories, db.subcategories, db.transactions, db.budgets, db.recurrences, db.merchants], async () => {
    await db.transactions.where('categoryId').equals(id).modify((t) => {
      delete t.categoryId;
      delete t.subcategoryId;
    });
    await db.recurrences.filter((r) => r.categoryId === id).modify((r) => {
      delete r.categoryId;
      delete r.subcategoryId;
    });
    await db.merchants.filter((m) => m.lastCategoryId === id).modify((m) => {
      delete m.lastCategoryId;
      delete m.lastSubcategoryId;
    });
    await db.subcategories.where('categoryId').equals(id).delete();
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
}

export async function deleteSubcategory(id: ID, db: FinanceDB = defaultDb) {
  await db.transaction('rw', [db.subcategories, db.transactions, db.recurrences, db.merchants], async () => {
    await db.transactions.where('subcategoryId').equals(id).modify((t) => {
      delete t.subcategoryId;
    });
    await db.recurrences.filter((r) => r.subcategoryId === id).modify((r) => {
      delete r.subcategoryId;
    });
    await db.merchants.filter((m) => m.lastSubcategoryId === id).modify((m) => {
      delete m.lastSubcategoryId;
    });
    await db.subcategories.delete(id);
  });
}

// ---------------------------------------------------------------- contas, pessoas, transferências

export async function saveAccount(acc: Omit<Account, 'id'> & { id?: ID }, db: FinanceDB = defaultDb) {
  if (!acc.name.trim()) throw new Error('Informe o nome da conta.');
  await db.accounts.put({ ...acc, id: acc.id ?? newId() } as Account);
}

export async function deleteAccount(id: ID, db: FinanceDB = defaultDb) {
  const used =
    (await db.transactions.filter((t) => t.accountId === id || t.payments.some((p) => p.accountId === id)).count()) +
    (await db.transfers.filter((t) => t.fromAccountId === id || t.toAccountId === id).count()) +
    (await db.invoicePayments.filter((p) => p.accountId === id).count());
  if (used > 0) {
    // preserva o histórico: arquiva em vez de apagar
    await db.accounts.update(id, { archived: true });
    return 'arquivada' as const;
  }
  await db.accounts.delete(id);
  return 'excluida' as const;
}

export async function savePerson(p: Omit<Person, 'id'> & { id?: ID }, db: FinanceDB = defaultDb) {
  if (!p.name.trim()) throw new Error('Informe o nome.');
  await db.people.put({ ...p, name: p.name.trim(), id: p.id ?? newId() });
}

export async function deletePerson(id: ID, db: FinanceDB = defaultDb) {
  await db.transaction('rw', [db.people, db.transactions, db.cards], async () => {
    await db.transactions.filter((t) => t.personId === id).modify((t) => {
      delete t.personId;
    });
    await db.cards.filter((c) => c.holderId === id).modify((c) => {
      delete c.holderId;
    });
    await db.people.delete(id);
  });
}

export async function saveTransfer(tr: Omit<Transfer, 'id'> & { id?: ID }, db: FinanceDB = defaultDb) {
  const errors = validateTransfer(tr);
  if (errors.length) throw new Error(errors.join(' '));
  await db.transfers.put({ ...tr, id: tr.id ?? newId() });
}

export async function deleteTransfer(id: ID, db: FinanceDB = defaultDb) {
  await db.transfers.delete(id);
}

// ---------------------------------------------------------------- orçamento

export async function setBudget(categoryId: ID, amount: Cents, db: FinanceDB = defaultDb) {
  const existing = await db.budgets.where('categoryId').equals(categoryId).first();
  if (amount <= 0) {
    if (existing) await db.budgets.delete(existing.id);
    return;
  }
  await db.budgets.put({ id: existing?.id ?? newId(), categoryId, amount } satisfies Budget);
}

// ---------------------------------------------------------------- recorrências

/** Gera lançamentos das recorrências ativas até o fim do próximo mês. */
export async function syncRecurrences(ref: ISODate = today(), db: FinanceDB = defaultDb): Promise<number> {
  const horizon = monthEnd(addMonthKey(ref.slice(0, 7), 1));
  let created = 0;
  await db.transaction('rw', db.recurrences, db.transactions, db.cards, async () => {
    const [recs, cards] = await Promise.all([db.recurrences.where('state').equals('ativa').toArray(), db.cards.toArray()]);
    for (const rec of recs) {
      const { transactions, generatedUntil } = generateRecurrence(rec, horizon, newId, cards);
      if (transactions.length) await db.transactions.bulkAdd(transactions);
      if (generatedUntil !== rec.generatedUntil) await db.recurrences.update(rec.id, { generatedUntil });
      created += transactions.length;
    }
  });
  return created;
}

export async function saveRecurrence(rec: Omit<Recurrence, 'id' | 'generatedUntil' | 'state'> & { id?: ID; state?: Recurrence['state'] }, db: FinanceDB = defaultDb) {
  if (!rec.description.trim()) throw new Error('Informe a descrição.');
  if (!(rec.amount > 0)) throw new Error('Informe um valor maior que zero.');
  if (rec.paymentMethod === 'credito' && !rec.cardId) throw new Error('Selecione o cartão de crédito.');
  if (rec.id) {
    const existing = await db.recurrences.get(rec.id);
    if (!existing) throw new Error('Recorrência não encontrada.');
    const updated: Recurrence = { ...existing, ...rec, id: existing.id, state: existing.state, generatedUntil: existing.generatedUntil };
    await db.transaction('rw', db.recurrences, db.transactions, async () => {
      await db.recurrences.put(updated);
      // atualiza ocorrências futuras ainda não pagas
      await db.transactions
        .where('recurrenceId')
        .equals(existing.id)
        .filter((t) => t.date >= today() && t.payments.length === 0)
        .modify((t) => {
          t.description = updated.description;
          t.amount = updated.amount;
          t.categoryId = updated.categoryId;
          t.subcategoryId = updated.subcategoryId;
          t.merchant = updated.merchant;
          t.estimated = updated.variableAmount || undefined;
        });
    });
    return existing.id;
  }
  const id = newId();
  await db.recurrences.add({ ...rec, id, state: 'ativa' });
  await syncRecurrences(today(), db);
  return id;
}

export async function setRecurrenceState(id: ID, state: Recurrence['state'], db: FinanceDB = defaultDb) {
  const rec = await db.recurrences.get(id);
  if (!rec) return;
  const ref = today();
  if (state === 'ativa') {
    await db.recurrences.put(resumeRecurrence(rec, ref));
    await syncRecurrences(ref, db);
    return;
  }
  await db.transaction('rw', db.recurrences, db.transactions, async () => {
    await db.recurrences.update(id, { state });
    // remove ocorrências futuras ainda em aberto
    await db.transactions
      .where('recurrenceId')
      .equals(id)
      .filter((t) => t.date > ref && t.payments.length === 0 && !t.cardId)
      .delete();
    if (state === 'pausada') await db.recurrences.update(id, { generatedUntil: ref });
  });
}

export async function deleteRecurrence(id: ID, opts: { removeOpen: boolean }, db: FinanceDB = defaultDb) {
  await db.transaction('rw', db.recurrences, db.transactions, async () => {
    if (opts.removeOpen) await db.transactions.where('recurrenceId').equals(id).filter((t) => t.payments.length === 0 && !t.cardId).delete();
    await db.transactions.where('recurrenceId').equals(id).modify((t) => {
      delete t.recurrenceId;
    });
    await db.recurrences.delete(id);
  });
}
