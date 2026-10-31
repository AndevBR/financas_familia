import type { Card, Transaction } from '../domain/types';

let n = 0;
export const newId = () => `id${++n}`;

export function card(over: Partial<Card> = {}): Card {
  return { id: 'c1', name: 'Nubank', limit: 500000, closingDay: 5, dueDay: 12, color: '#000', ...over };
}

export function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: newId(),
    type: 'despesa',
    description: 'Teste',
    amount: 10000,
    date: '2026-10-10',
    paymentMethod: 'pix',
    payments: [],
    createdAt: '2026-10-10T10:00:00.000Z',
    ...over,
  };
}

export const paidTx = (over: Partial<Transaction> = {}): Transaction => {
  const t = tx(over);
  return { ...t, payments: [{ id: newId(), date: t.date, amount: t.amount, accountId: t.accountId }] };
};
