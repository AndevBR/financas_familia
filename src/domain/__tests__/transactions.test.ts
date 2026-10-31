import { addPayment, applyAmountChange, buildTransactions, defaultDescription, isOverdue, openAmount, reopen, settle, statusLabel, txStatus, validateEntry } from '../transactions';
import { card, newId, tx } from '../../test/helpers';

describe('lançamentos', () => {
  it('cria despesa paga com uma baixa total', () => {
    const [t] = buildTransactions(
      { type: 'despesa', amount: 8000, date: '2026-10-10', paymentMethod: 'pix', paid: true, accountId: 'a1', categoryId: 'cat', merchant: ' iFood ' },
      newId,
      { description: 'iFood' },
    );
    expect(t.payments).toHaveLength(1);
    expect(t.payments[0]).toMatchObject({ amount: 8000, accountId: 'a1', date: '2026-10-10' });
    expect(t.merchant).toBe('iFood');
    expect(txStatus(t)).toBe('pago');
  });

  it('cria despesa em aberto sem baixa', () => {
    const [t] = buildTransactions({ type: 'despesa', amount: 8000, date: '2026-10-10', paymentMethod: 'boleto', paid: false }, newId, { description: 'Luz' });
    expect(t.payments).toEqual([]);
    expect(txStatus(t)).toBe('aberto');
  });

  it('parcela compras no cartão em faturas consecutivas', () => {
    const c = card({ closingDay: 5, dueDay: 12 });
    const list = buildTransactions(
      { type: 'despesa', amount: 100000, date: '2026-10-20', paymentMethod: 'credito', cardId: c.id, paid: true, installments: 3 },
      newId,
      { description: 'TV', card: c },
    );
    expect(list).toHaveLength(3);
    expect(list.map((t) => t.amount)).toEqual([33334, 33333, 33333]);
    expect(list.map((t) => t.invoiceMonth)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(list.map((t) => t.date)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20']);
    expect(list[1].description).toBe('TV (2/3)');
    expect(list.every((t) => t.payments.length === 0 && t.cardId === c.id && !t.accountId)).toBe(true);
    expect(new Set(list.map((t) => t.installment!.groupId)).size).toBe(1);
    expect(list[0].installment).toMatchObject({ number: 1, total: 3, totalAmount: 100000 });
  });

  it('valida campos mínimos', () => {
    expect(validateEntry({ type: 'despesa', amount: 0, date: '2026-10-10', paymentMethod: 'pix', paid: true })).toContain('Informe um valor maior que zero.');
    expect(validateEntry({ type: 'despesa', amount: 100, date: '2026-10-10', paymentMethod: 'credito', paid: true }).length).toBeGreaterThan(0);
    expect(validateEntry({ type: 'despesa', amount: 100, date: '2026-10-10', paymentMethod: 'pix', paid: true, installments: 2 }).length).toBeGreaterThan(0);
    expect(validateEntry({ type: 'despesa', amount: 100, date: '2026-10-10', paymentMethod: 'pix', paid: true })).toEqual([]);
    expect(() => buildTransactions({ type: 'despesa', amount: -1, date: '2026-10-10', paymentMethod: 'pix', paid: true }, newId, { description: 'x' })).toThrow();
  });

  it('gera descrição automática', () => {
    const base = { type: 'despesa' as const, amount: 1, date: '2026-10-10', paymentMethod: 'pix' as const, paid: true };
    expect(defaultDescription({ ...base, merchant: 'iFood' })).toBe('iFood');
    expect(defaultDescription(base, 'Padaria')).toBe('Padaria');
    expect(defaultDescription({ ...base, description: '  Pão ' })).toBe('Pão');
    expect(defaultDescription(base)).toBe('Despesa');
  });

  it('registra pagamentos parciais e quitação', () => {
    let t = tx({ amount: 10000 });
    t = addPayment(t, { id: 'p1', date: '2026-10-10', amount: 4000 });
    expect(txStatus(t)).toBe('parcial');
    expect(openAmount(t)).toBe(6000);
    expect(() => addPayment(t, { id: 'p2', date: '2026-10-11', amount: 7000 })).toThrow();
    t = settle(t, newId, '2026-10-12', 'a1');
    expect(txStatus(t)).toBe('pago');
    expect(t.payments[1]).toMatchObject({ amount: 6000, accountId: 'a1' });
    expect(txStatus(reopen(t))).toBe('aberto');
  });

  it('não permite baixa individual de compra no cartão', () => {
    expect(() => addPayment(tx({ cardId: 'c1' }), { id: 'p', date: '2026-10-10', amount: 100 })).toThrow();
  });

  it('identifica vencidos', () => {
    const t = tx({ date: '2026-10-01' });
    expect(isOverdue(t, '2026-10-02')).toBe(true);
    expect(isOverdue(t, '2026-10-01')).toBe(false);
    expect(statusLabel(t, '2026-10-05')).toBe('Vencido');
    expect(statusLabel(tx({ type: 'receita', date: '2026-12-01' }), '2026-10-05')).toBe('A receber');
    expect(isOverdue(tx({ date: '2026-10-01', cardId: 'c1' }), '2026-11-01')).toBe(false);
  });

  it('mantém pago ao editar o valor de lançamento quitado', () => {
    const t = { ...tx({ amount: 1000 }), payments: [{ id: 'p', date: '2026-10-10', amount: 1000 }] };
    const edited = applyAmountChange(t, 1500);
    expect(txStatus(edited)).toBe('pago');
    expect(edited.payments[0].amount).toBe(1500);
  });
});
