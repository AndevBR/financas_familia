import { sum } from './money';
import type { Account, Cents, ID, ISODate, InvoicePayment, Transaction, Transfer } from './types';

export interface AccountMovement {
  date: ISODate;
  description: string;
  amount: Cents; // positivo = entrada, negativo = saída
  kind: 'receita' | 'despesa' | 'fatura' | 'transferencia';
}

/**
 * Extrato de uma conta. Considera apenas o dinheiro que efetivamente se moveu:
 * baixas de lançamentos, pagamentos de fatura e transferências.
 * Transferências entre contas próprias não são receitas nem despesas.
 */
export function accountMovements(
  accountId: ID,
  data: { transactions: Transaction[]; invoicePayments: InvoicePayment[]; transfers: Transfer[]; cardNames?: Record<ID, string>; accountNames?: Record<ID, string> },
  asOf?: ISODate,
): AccountMovement[] {
  const out: AccountMovement[] = [];
  for (const t of data.transactions) {
    for (const p of t.payments) {
      if (p.accountId !== accountId) continue;
      out.push({ date: p.date, description: t.description, amount: t.type === 'receita' ? p.amount : -p.amount, kind: t.type });
    }
  }
  for (const p of data.invoicePayments) {
    if (p.accountId !== accountId) continue;
    out.push({ date: p.date, description: `Fatura ${data.cardNames?.[p.cardId] ?? 'cartão'}`, amount: -p.amount, kind: 'fatura' });
  }
  for (const tr of data.transfers) {
    if (tr.fromAccountId === accountId)
      out.push({ date: tr.date, description: `Transferência para ${data.accountNames?.[tr.toAccountId] ?? 'outra conta'}`, amount: -tr.amount, kind: 'transferencia' });
    if (tr.toAccountId === accountId)
      out.push({ date: tr.date, description: `Transferência de ${data.accountNames?.[tr.fromAccountId] ?? 'outra conta'}`, amount: tr.amount, kind: 'transferencia' });
  }
  return out.filter((m) => !asOf || m.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
}

export function accountBalance(
  account: Account,
  data: { transactions: Transaction[]; invoicePayments: InvoicePayment[]; transfers: Transfer[] },
  asOf?: ISODate,
): Cents {
  return account.initialBalance + sum(accountMovements(account.id, data, asOf).map((m) => m.amount));
}

export function totalBalance(
  accounts: Account[],
  data: { transactions: Transaction[]; invoicePayments: InvoicePayment[]; transfers: Transfer[] },
  asOf?: ISODate,
): Cents {
  return sum(accounts.filter((a) => !a.archived).map((a) => accountBalance(a, data, asOf)));
}

export function validateTransfer(tr: Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'amount'>): string[] {
  const errors: string[] = [];
  if (!tr.fromAccountId || !tr.toAccountId) errors.push('Selecione as contas de origem e destino.');
  else if (tr.fromAccountId === tr.toAccountId) errors.push('A conta de origem e destino devem ser diferentes.');
  if (!(tr.amount > 0)) errors.push('Informe um valor maior que zero.');
  return errors;
}
