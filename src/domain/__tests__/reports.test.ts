import { budgetLevel, budgetStatus, byCategory, byMerchant, bySubcategory, compareCategories, detectRecurring, filterTransactions, monthSummary, monthlyEvolution, savingOpportunities, simulateSavings, topExpenses } from '../reports';
import type { DataSet } from '../reports';
import type { Category, Subcategory } from '../types';
import { card, paidTx, tx } from '../../test/helpers';

const categories: Category[] = [
  { id: 'app', name: 'Aplicativos', type: 'despesa', color: '#f00', essential: false, order: 0 },
  { id: 'casa', name: 'Casa', type: 'despesa', color: '#0f0', essential: true, order: 1 },
  { id: 'rec', name: 'Receitas', type: 'receita', color: '#00f', essential: true, order: 2 },
];
const subcategories: Subcategory[] = [
  { id: 'app-ali', categoryId: 'app', name: 'Alimentação' },
  { id: 'app-far', categoryId: 'app', name: 'Farmácia' },
  { id: 'casa-luz', categoryId: 'casa', name: 'Energia' },
];

describe('filtros', () => {
  const list = [
    paidTx({ categoryId: 'app', subcategoryId: 'app-ali', merchant: 'iFood', date: '2026-10-01', personId: 'p1' }),
    tx({ categoryId: 'casa', subcategoryId: 'casa-luz', date: '2026-10-05', description: 'Conta de luz' }),
    tx({ categoryId: 'app', merchant: 'IFOOD', date: '2026-09-01', cardId: 'c1', invoiceMonth: '2026-10' }),
    paidTx({ type: 'receita', categoryId: 'rec', date: '2026-10-05' }),
  ];
  const cards = [card({ holderId: 'p2' })];

  it('filtra por período, tipo, categoria, subcategoria e estabelecimento', () => {
    expect(filterTransactions(list, { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(3);
    expect(filterTransactions(list, { type: 'receita' })).toHaveLength(1);
    expect(filterTransactions(list, { categoryId: 'app' })).toHaveLength(2);
    expect(filterTransactions(list, { subcategoryId: 'app-ali' })).toHaveLength(1);
    expect(filterTransactions(list, { merchant: 'ifood' })).toHaveLength(2);
  });

  it('filtra por pessoa (inclusive pelo titular do cartão), cartão, status e texto', () => {
    expect(filterTransactions(list, { personId: 'p1' }, cards)).toHaveLength(1);
    expect(filterTransactions(list, { personId: 'p2' }, cards)).toHaveLength(1);
    expect(filterTransactions(list, { cardId: 'c1' })).toHaveLength(1);
    expect(filterTransactions(list, { status: 'aberto' })).toHaveLength(1);
    expect(filterTransactions(list, { status: 'vencido' }, [], '2026-10-10')).toHaveLength(1);
    expect(filterTransactions(list, { search: 'LUZ' })).toHaveLength(1);
  });
});

describe('agrupamentos e rankings', () => {
  const list = [
    tx({ categoryId: 'app', subcategoryId: 'app-ali', merchant: 'iFood', amount: 8000 }),
    tx({ categoryId: 'app', subcategoryId: 'app-far', merchant: 'iFood', amount: 4500 }),
    tx({ categoryId: 'casa', subcategoryId: 'casa-luz', merchant: 'Enel', amount: 20000 }),
  ];

  it('mostra gastos por aplicativo e por finalidade', () => {
    const cats = byCategory(list, categories);
    expect(cats[0]).toMatchObject({ label: 'Casa', total: 20000 });
    expect(cats[1]).toMatchObject({ label: 'Aplicativos', total: 12500, count: 2 });
    const subs = bySubcategory(list, categories, subcategories);
    expect(subs.map((s) => s.label)).toEqual(['Casa › Energia', 'Aplicativos › Alimentação', 'Aplicativos › Farmácia']);
    const m = byMerchant(list);
    expect(m[1]).toMatchObject({ label: 'iFood', total: 12500, count: 2 });
    expect(Math.round(cats.reduce((a, c) => a + c.percent, 0))).toBe(100);
  });

  it('lista maiores despesas', () => {
    expect(topExpenses(list, 2).map((t) => t.amount)).toEqual([20000, 8000]);
  });
});

describe('resumo mensal', () => {
  const c = card({ id: 'c1', closingDay: 5, dueDay: 12 });
  const data: DataSet = {
    categories,
    subcategories,
    accounts: [{ id: 'a1', name: 'Banco', type: 'banco', initialBalance: 100000, color: '#000' }],
    cards: [c],
    budgets: [],
    transfers: [],
    invoicePayments: [{ id: 'ip', cardId: 'c1', invoiceMonth: '2026-10', amount: 3000, date: '2026-10-12', accountId: 'a1' }],
    transactions: [
      paidTx({ type: 'receita', categoryId: 'rec', amount: 500000, date: '2026-10-05', accountId: 'a1' }),
      tx({ type: 'receita', categoryId: 'rec', amount: 50000, date: '2026-10-25' }),
      paidTx({ categoryId: 'casa', amount: 20000, date: '2026-10-10', accountId: 'a1' }),
      tx({ categoryId: 'casa', amount: 15000, date: '2026-10-20' }),
      tx({ categoryId: 'app', amount: 8000, date: '2026-10-02', cardId: 'c1', invoiceMonth: '2026-10' }),
      tx({ categoryId: 'casa', amount: 7000, date: '2026-09-20' }), // vencida do mês anterior
      paidTx({ categoryId: 'app', amount: 10000, date: '2026-09-02', accountId: 'a1' }),
    ],
  };

  it('responde às perguntas do dashboard', () => {
    const s = monthSummary(data, '2026-10', '2026-10-15');
    expect(s.income).toBe(550000);
    expect(s.received).toBe(500000);
    expect(s.toReceive).toBe(50000);
    expect(s.expenses).toBe(43000); // 20000 + 15000 + 8000 (compra no cartão conta uma vez só)
    expect(s.paid).toBe(20000 + 3000); // conta paga + parte da fatura
    expect(s.toPay).toBe(15000 + 5000);
    expect(s.overduePrevious).toBe(7000);
    expect(s.available).toBe(100000 + 500000 - 20000 - 3000 - 10000);
    expect(s.projectedEnd).toBe(s.available + 50000 - 20000 - 7000);
    expect(s.topCategory?.label).toBe('Casa');
    expect(s.previous.expenses).toBe(17000);
    expect(s.expenseChange).toBeCloseTo(((43000 - 17000) / 17000) * 100);
  });

  it('calcula evolução e economia acumulada', () => {
    const ev = monthlyEvolution(data.transactions, '2026-09', '2026-10');
    expect(ev[0]).toMatchObject({ income: 0, expenses: 17000, result: -17000 });
    expect(ev[1].accumulated).toBe(-17000 + 550000 - 43000);
  });

  it('compara categorias entre períodos', () => {
    const cmp = compareCategories(data.transactions, categories, { from: '2026-10-01', to: '2026-10-31' }, { from: '2026-09-01', to: '2026-09-30' });
    const casa = cmp.find((c) => c.categoryId === 'casa')!;
    expect(casa).toMatchObject({ current: 35000, previous: 7000, diff: 28000 });
    expect(casa.diffPercent).toBe(400);
  });
});

describe('orçamento e economia', () => {
  const txs = [
    tx({ categoryId: 'app', amount: 24000, date: '2026-10-03' }),
    tx({ categoryId: 'app', amount: 10000, date: '2026-10-04' }),
    tx({ categoryId: 'casa', amount: 10000, date: '2026-10-04' }),
    tx({ categoryId: 'app', amount: 20000, date: '2026-09-04' }),
    tx({ categoryId: 'app', amount: 20000, date: '2026-08-04' }),
    tx({ categoryId: 'casa', amount: 10000, date: '2026-09-04' }),
  ];

  it('classifica alertas de 80% e 100%', () => {
    expect(budgetLevel(79.9)).toBe('ok');
    expect(budgetLevel(80)).toBe('alerta');
    expect(budgetLevel(100)).toBe('estourado');
    const st = budgetStatus(
      { transactions: txs, categories, budgets: [{ id: 'b1', categoryId: 'app', amount: 30000 }, { id: 'b2', categoryId: 'casa', amount: 12000 }] },
      '2026-10',
    );
    expect(st[0]).toMatchObject({ spent: 34000, remaining: -4000, level: 'estourado' });
    expect(st[1]).toMatchObject({ spent: 10000, level: 'alerta' });
  });

  it('aponta categorias que cresceram e não essenciais', () => {
    const ops = savingOpportunities({ transactions: txs, categories, subcategories }, '2026-10');
    expect(ops).toHaveLength(1); // Casa é essencial e não cresceu
    expect(ops[0]).toMatchObject({ categoryId: 'app', current: 34000, average: 20000, increase: 14000 });
    expect(ops[0].reason).toContain('70%');
    expect(ops[0].baseMonthly).toBe(Math.round((34000 + 40000) / 3));
  });

  it('simula a economia mensal', () => {
    expect(simulateSavings([{ baseMonthly: 30000, reductionPercent: 20 }, { baseMonthly: 10000, reductionPercent: 50 }])).toBe(11000);
    expect(simulateSavings([{ baseMonthly: 100, reductionPercent: 150 }])).toBe(100);
  });

  it('detecta gastos que se repetem', () => {
    const list = ['2026-08-01', '2026-09-01', '2026-10-01'].map((d) => tx({ merchant: 'Netflix', amount: 5590, date: d }));
    expect(detectRecurring(list)[0]).toMatchObject({ merchant: 'Netflix', months: 3, average: 5590 });
    expect(detectRecurring(list.slice(0, 2))).toHaveLength(0);
  });
});
