import { generateRecurrence, monthlyEquivalent, nextOccurrence, occurrences, resumeRecurrence } from '../recurrence';
import type { Recurrence } from '../types';
import { card, newId } from '../../test/helpers';

const rec = (over: Partial<Recurrence> = {}): Recurrence => ({
  id: 'r1',
  type: 'despesa',
  description: 'Internet',
  amount: 12000,
  variableAmount: false,
  frequency: 'mensal',
  startDate: '2026-01-31',
  paymentMethod: 'boleto',
  state: 'ativa',
  ...over,
});

describe('recorrências', () => {
  it('gera datas mensais respeitando fim de mês', () => {
    expect(occurrences(rec(), '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('gera datas semanais e anuais', () => {
    expect(occurrences(rec({ frequency: 'semanal', startDate: '2026-10-01' }), '2026-10-01', '2026-10-31')).toHaveLength(5);
    expect(occurrences(rec({ frequency: 'anual', startDate: '2024-02-29' }), '2024-01-01', '2027-12-31')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
  });

  it('respeita a data final', () => {
    expect(occurrences(rec({ endDate: '2026-02-28' }), '2026-01-01', '2026-12-31')).toHaveLength(2);
  });

  it('não duplica ocorrências já geradas', () => {
    const r = rec({ startDate: '2026-10-10' });
    const first = generateRecurrence(r, '2026-11-30', newId);
    expect(first.transactions.map((t) => t.date)).toEqual(['2026-10-10', '2026-11-10']);
    const second = generateRecurrence({ ...r, generatedUntil: first.generatedUntil }, '2026-12-31', newId);
    expect(second.transactions.map((t) => t.date)).toEqual(['2026-12-10']);
    expect(second.transactions[0]).toMatchObject({ recurrenceId: 'r1', amount: 12000, payments: [] });
  });

  it('não gera quando pausada ou cancelada', () => {
    expect(generateRecurrence(rec({ state: 'pausada' }), '2026-12-31', newId).transactions).toHaveLength(0);
    expect(generateRecurrence(rec({ state: 'cancelada' }), '2026-12-31', newId).transactions).toHaveLength(0);
    expect(nextOccurrence(rec({ state: 'pausada' }), '2026-10-01')).toBeUndefined();
  });

  it('ao reativar, não gera o período pausado', () => {
    const r = resumeRecurrence(rec({ state: 'pausada', startDate: '2026-01-10', generatedUntil: '2026-03-31' }), '2026-10-31');
    const g = generateRecurrence(r, '2026-11-30', newId);
    expect(g.transactions.map((t) => t.date)).toEqual(['2026-11-10']);
  });

  it('marca valor estimado, débito automático e cartão', () => {
    const g = generateRecurrence(rec({ startDate: '2026-10-10', variableAmount: true, autoPay: true, accountId: 'a1' }), '2026-10-31', newId);
    expect(g.transactions[0].estimated).toBe(true);
    expect(g.transactions[0].payments[0]).toMatchObject({ amount: 12000, accountId: 'a1' });
    const c = card();
    const gc = generateRecurrence(rec({ startDate: '2026-10-10', paymentMethod: 'credito', cardId: c.id, autoPay: true }), '2026-10-31', newId, [c]);
    expect(gc.transactions[0]).toMatchObject({ cardId: 'c1', invoiceMonth: '2026-11', payments: [] });
  });

  it('calcula equivalente mensal', () => {
    expect(monthlyEquivalent({ amount: 1200, frequency: 'anual' })).toBe(100);
    expect(monthlyEquivalent({ amount: 1000, frequency: 'semanal' })).toBe(4333);
  });
});
