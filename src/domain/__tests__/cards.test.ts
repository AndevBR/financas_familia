import { buildInvoice, cardUsage, installmentPlans, invoiceClosingDate, invoiceDueDate, invoiceMonthFor, listInvoices } from '../cards';
import { buildTransactions } from '../transactions';
import { card, newId, tx } from '../../test/helpers';

describe('cartões de crédito', () => {
  const c = card({ closingDay: 5, dueDay: 12 });
  const late = card({ id: 'c2', closingDay: 28, dueDay: 5 });

  it('define a fatura pela data de fechamento', () => {
    expect(invoiceMonthFor('2026-10-04', c)).toBe('2026-10');
    expect(invoiceMonthFor('2026-10-05', c)).toBe('2026-11'); // no dia do fechamento já vai para a próxima
    expect(invoiceMonthFor('2026-12-20', c)).toBe('2027-01');
    // fecha 28 e vence 5 do mês seguinte
    expect(invoiceMonthFor('2026-10-27', late)).toBe('2026-11');
    expect(invoiceMonthFor('2026-10-28', late)).toBe('2026-12');
    // fechamento dia 31 em fevereiro usa o último dia do mês
    expect(invoiceMonthFor('2026-02-28', card({ closingDay: 31, dueDay: 10 }))).toBe('2026-04');
  });

  it('calcula datas de fechamento e vencimento', () => {
    expect(invoiceDueDate('2026-11', c)).toBe('2026-11-12');
    expect(invoiceClosingDate('2026-11', c)).toBe('2026-11-05');
    expect(invoiceClosingDate('2026-11', late)).toBe('2026-10-28');
    expect(invoiceDueDate('2026-02', card({ dueDay: 30 }))).toBe('2026-02-28');
  });

  it('monta a fatura e o status de pagamento', () => {
    const items = [tx({ cardId: 'c1', invoiceMonth: '2026-11', amount: 5000 }), tx({ cardId: 'c1', invoiceMonth: '2026-11', amount: 3000 }), tx({ cardId: 'c1', invoiceMonth: '2026-12', amount: 999 })];
    let inv = buildInvoice(c, '2026-11', items, [], '2026-11-01');
    expect(inv.total).toBe(8000);
    expect(inv.status).toBe('aberta');
    inv = buildInvoice(c, '2026-11', items, [], '2026-11-06');
    expect(inv.status).toBe('fechada');
    const pay = [{ id: 'p', cardId: 'c1', invoiceMonth: '2026-11', amount: 3000, date: '2026-11-10' }];
    inv = buildInvoice(c, '2026-11', items, pay, '2026-11-10');
    expect(inv).toMatchObject({ paid: 3000, open: 5000, status: 'parcial' });
    expect(buildInvoice(c, '2026-11', items, pay, '2026-11-13').status).toBe('vencida');
    const full = [...pay, { id: 'p2', cardId: 'c1', invoiceMonth: '2026-11', amount: 5000, date: '2026-11-11' }];
    expect(buildInvoice(c, '2026-11', items, full, '2026-11-20').status).toBe('paga');
    expect(listInvoices(c, items, full).map((i) => i.month)).toEqual(['2026-11', '2026-12']);
  });

  it('pagamento de fatura não cria despesa nova e libera limite', () => {
    const items = buildTransactions(
      { type: 'despesa', amount: 120000, date: '2026-10-01', paymentMethod: 'credito', cardId: 'c1', paid: true, installments: 4 },
      newId,
      { description: 'Geladeira', card: c },
    );
    const u1 = cardUsage(c, items, [], '2026-10-01');
    expect(u1.used).toBe(120000);
    expect(u1.available).toBe(380000);
    expect(u1.futureInstallments).toBe(90000);
    const pays = [{ id: 'p', cardId: 'c1', invoiceMonth: '2026-10', amount: 30000, date: '2026-10-12' }];
    expect(cardUsage(c, items, pays, '2026-10-13').used).toBe(90000);
    // as despesas continuam sendo as compras: 4 lançamentos somando o valor original
    expect(items.reduce((a, t) => a + t.amount, 0)).toBe(120000);
  });

  it('acompanha o andamento dos parcelamentos', () => {
    const items = buildTransactions(
      { type: 'despesa', amount: 60000, date: '2026-08-01', paymentMethod: 'credito', cardId: 'c1', paid: true, installments: 6 },
      newId,
      { description: 'Sofá', card: c },
    );
    const [plan] = installmentPlans(items, '2026-10-15');
    expect(plan.description).toBe('Sofá');
    expect(plan.total).toBe(6);
    expect(plan.paidCount).toBe(2); // faturas de ago e set
    expect(plan.remainingAmount).toBe(40000);
    expect(plan.nextInvoice).toBe('2026-10');
    expect(plan.lastInvoice).toBe('2027-01');
  });
});
