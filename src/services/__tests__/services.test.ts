import { FinanceDB } from '../../db/database';
import {
  deleteCategory,
  deleteRecurrence,
  deleteTransaction,
  ensureSeed,
  payInvoice,
  registerPayment,
  saveCard,
  saveQuickEntry,
  saveRecurrence,
  saveTransfer,
  setBudget,
  setRecurrenceState,
  settleTransaction,
  syncRecurrences,
  updateTransaction,
} from '../finance';
import { exportBackup, restoreBackup, validateBackup } from '../backup';
import { monthSummary, type DataSet } from '../../domain/reports';
import { addMonthKey, monthEnd, today } from '../../domain/dates';
import { txStatus } from '../../domain/transactions';

let db: FinanceDB;
let dbn = 0;

beforeEach(async () => {
  db = new FinanceDB(`test-${++dbn}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

async function loadData(): Promise<DataSet> {
  const [transactions, categories, subcategories, accounts, cards, invoicePayments, transfers, budgets] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.subcategories.toArray(),
    db.accounts.toArray(),
    db.cards.toArray(),
    db.invoicePayments.toArray(),
    db.transfers.toArray(),
    db.budgets.toArray(),
  ]);
  return { transactions, categories, subcategories, accounts, cards, invoicePayments, transfers, budgets };
}

describe('serviços com IndexedDB', () => {
  it('cria dados iniciais apenas uma vez', async () => {
    await ensureSeed(db);
    expect(await db.categories.count()).toBe(10);
    expect(await db.subcategories.count()).toBeGreaterThan(40);
    expect(await db.people.count()).toBe(2);
  });

  it('lançamento rápido salva e memoriza o estabelecimento', async () => {
    const cat = (await db.categories.toArray()).find((c) => c.name === 'Aplicativos')!;
    const sub = (await db.subcategories.where('categoryId').equals(cat.id).toArray()).find((s) => s.name === 'Alimentação')!;
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 8000, date: '2026-10-10', paymentMethod: 'pix', paid: true, categoryId: cat.id, subcategoryId: sub.id, merchant: 'iFood' }, db);
    expect(t.description).toBe('iFood');
    const m = await db.merchants.toArray();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ name: 'iFood', lastCategoryId: cat.id, lastSubcategoryId: sub.id, usageCount: 1 });
    await saveQuickEntry({ type: 'despesa', amount: 4500, date: '2026-10-11', paymentMethod: 'pix', paid: true, categoryId: cat.id, merchant: 'ifood' }, db);
    expect((await db.merchants.toArray())[0].usageCount).toBe(2);
  });

  it('compra no cartão + pagamento da fatura não duplica a despesa', async () => {
    const acc = (await db.accounts.toArray())[0];
    await saveCard({ name: 'Visa', limit: 500000, closingDay: 5, dueDay: 12, color: '#000' }, db);
    const card = (await db.cards.toArray())[0];
    await saveQuickEntry({ type: 'despesa', amount: 30000, date: '2026-10-01', paymentMethod: 'credito', cardId: card.id, paid: true, installments: 3 }, db);
    await payInvoice({ cardId: card.id, invoiceMonth: '2026-10', amount: 10000, date: '2026-10-12', accountId: acc.id }, db);
    const s = monthSummary(await loadData(), '2026-10', '2026-10-15');
    expect(s.expenses).toBe(10000); // só a parcela de outubro
    expect(s.paid).toBe(10000);
    expect(s.available).toBe(-10000); // dinheiro saiu da conta pela fatura
  });

  it('pagamento parcial e quitação', async () => {
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 10000, date: '2026-10-10', paymentMethod: 'boleto', paid: false }, db);
    await registerPayment(t.id, 3000, '2026-10-10', undefined, db);
    expect(txStatus((await db.transactions.get(t.id))!)).toBe('parcial');
    await settleTransaction(t.id, '2026-10-11', undefined, db);
    expect(txStatus((await db.transactions.get(t.id))!)).toBe('pago');
  });

  it('edita e exclui lançamentos, inclusive todas as parcelas', async () => {
    await saveCard({ name: 'Master', limit: 100000, closingDay: 10, dueDay: 20, color: '#000' }, db);
    const card = (await db.cards.toArray())[0];
    const parts = await saveQuickEntry({ type: 'despesa', amount: 60000, date: '2026-10-01', paymentMethod: 'credito', cardId: card.id, paid: true, installments: 6 }, db);
    await updateTransaction(parts[0].id, { description: 'Notebook (1/6)', amount: 10000, date: '2026-10-01', paymentMethod: 'credito', cardId: card.id }, db);
    expect((await db.transactions.get(parts[0].id))!.description).toBe('Notebook (1/6)');
    expect(await deleteTransaction(parts[1].id, {}, db)).toBe(1);
    expect(await deleteTransaction(parts[2].id, { wholeGroup: true }, db)).toBe(5);
    expect(await db.transactions.count()).toBe(0);
  });

  it('edição permite mover a compra para outra fatura', async () => {
    await saveCard({ name: 'Nubank', limit: 0, closingDay: 27, dueDay: 3, color: '#000' }, db);
    const card = (await db.cards.toArray())[0];
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 120050, date: '2026-11-03', paymentMethod: 'credito', cardId: card.id, paid: true }, db);
    expect(t.invoiceMonth).toBe('2026-12');
    await updateTransaction(t.id, { description: t.description, amount: t.amount, date: t.date, paymentMethod: 'credito', cardId: card.id, invoiceMonth: '2026-11' }, db);
    expect((await db.transactions.get(t.id))!.invoiceMonth).toBe('2026-11');
    // sem escolha explícita, mantém a fatura atual ao editar outros campos
    await updateTransaction(t.id, { description: 'Saldo fatura outubro', amount: t.amount, date: t.date, paymentMethod: 'credito', cardId: card.id, invoiceMonth: '2026-11' }, db);
    expect((await db.transactions.get(t.id))!.invoiceMonth).toBe('2026-11');
  });

  it('transferências validam contas', async () => {
    const [a, b] = await db.accounts.toArray();
    await expect(saveTransfer({ fromAccountId: a.id, toAccountId: a.id, amount: 100, date: '2026-10-01' }, db)).rejects.toThrow();
    await saveTransfer({ fromAccountId: a.id, toAccountId: b.id, amount: 100, date: '2026-10-01' }, db);
    const s = monthSummary(await loadData(), '2026-10', '2026-10-15');
    expect(s.available).toBe(0);
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(0);
  });

  it('excluir categoria preserva lançamentos sem classificação e remove orçamento', async () => {
    const cat = (await db.categories.toArray())[0];
    await setBudget(cat.id, 30000, db);
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 100, date: '2026-10-10', paymentMethod: 'pix', paid: true, categoryId: cat.id }, db);
    await deleteCategory(cat.id, db);
    expect((await db.transactions.get(t.id))!.categoryId).toBeUndefined();
    expect(await db.budgets.count()).toBe(0);
    expect(await db.subcategories.where('categoryId').equals(cat.id).count()).toBe(0);
  });

  it('recorrências: gera, não duplica, pausa e exclui', async () => {
    const ref = today();
    const id = await saveRecurrence({ type: 'despesa', description: 'Internet', amount: 12000, variableAmount: false, frequency: 'mensal', startDate: ref, paymentMethod: 'boleto' }, db);
    const horizon = monthEnd(addMonthKey(ref.slice(0, 7), 1));
    const count = await db.transactions.where('recurrenceId').equals(id).count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect((await db.recurrences.get(id))!.generatedUntil).toBe(horizon);
    expect(await syncRecurrences(ref, db)).toBe(0);
    await setRecurrenceState(id, 'pausada', db);
    expect(await db.transactions.where('recurrenceId').equals(id).filter((t) => t.date > ref).count()).toBe(0);
    await deleteRecurrence(id, { removeOpen: true }, db);
    expect(await db.recurrences.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });

  it('backup completo e restauração', async () => {
    await saveQuickEntry({ type: 'receita', amount: 500000, date: '2026-10-05', paymentMethod: 'pix', paid: true }, db);
    const backup = await exportBackup(db);
    const json = JSON.parse(JSON.stringify(backup));
    const other = new FinanceDB(`test-restore-${dbn}`);
    const counts = await restoreBackup(json, other);
    expect(counts.transactions).toBe(1);
    expect(await other.categories.count()).toBe(10);
    await other.delete();
    expect(() => validateBackup({ format: 'outro' })).toThrow();
    expect(() => validateBackup({ ...json, data: { transactions: [{ semId: 1 }] } })).toThrow();
  });
});
