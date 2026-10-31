import { accountBalance, accountMovements, totalBalance, validateTransfer } from '../accounts';
import type { Account } from '../types';
import { paidTx, tx } from '../../test/helpers';

const acc = (id: string, initial = 0): Account => ({ id, name: id, type: 'banco', initialBalance: initial, color: '#000' });

describe('contas financeiras', () => {
  const transactions = [
    paidTx({ type: 'receita', amount: 500000, accountId: 'a1', date: '2026-10-05' }),
    paidTx({ amount: 20000, accountId: 'a1', date: '2026-10-06' }),
    tx({ amount: 99999, accountId: 'a1' }), // em aberto: não mexe no saldo
    tx({ amount: 5000, cardId: 'c1', invoiceMonth: '2026-11' }), // compra no cartão: não mexe no saldo
  ];
  const invoicePayments = [{ id: 'ip', cardId: 'c1', invoiceMonth: '2026-11', amount: 5000, date: '2026-11-12', accountId: 'a1' }];
  const transfers = [{ id: 't', fromAccountId: 'a1', toAccountId: 'a2', amount: 100000, date: '2026-10-07' }];
  const data = { transactions, invoicePayments, transfers };

  it('calcula saldo com entradas, saídas, faturas e transferências', () => {
    expect(accountBalance(acc('a1', 10000), data)).toBe(10000 + 500000 - 20000 - 5000 - 100000);
    expect(accountBalance(acc('a2'), data)).toBe(100000);
    expect(accountBalance(acc('a1', 10000), data, '2026-10-31')).toBe(10000 + 500000 - 20000 - 100000);
  });

  it('transferências não alteram o saldo total', () => {
    const noTransfer = { ...data, transfers: [] };
    expect(totalBalance([acc('a1'), acc('a2')], data)).toBe(totalBalance([acc('a1'), acc('a2')], noTransfer));
  });

  it('lista extrato ordenado', () => {
    const m = accountMovements('a1', data);
    expect(m.map((x) => x.kind)).toEqual(['receita', 'despesa', 'transferencia', 'fatura']);
  });

  it('valida transferências', () => {
    expect(validateTransfer({ fromAccountId: 'a', toAccountId: 'a', amount: 1 })).toHaveLength(1);
    expect(validateTransfer({ fromAccountId: 'a', toAccountId: 'b', amount: 0 })).toHaveLength(1);
    expect(validateTransfer({ fromAccountId: 'a', toAccountId: 'b', amount: 10 })).toEqual([]);
  });
});
