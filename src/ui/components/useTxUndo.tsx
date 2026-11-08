import { formatDateBR, formatMonth } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { isCardTx, paidAmount } from '../../domain/transactions';
import type { Transaction } from '../../domain/types';
import { moveCardPurchaseToBill, reopenTransaction } from '../../services/finance';
import { useApp } from '../AppContext';
import type { FinanceData } from '../hooks/useFinance';

/** Ações de desfazer: baixa pela conta bancária e pagamento no cartão. Sempre confirmam antes. */
export function useTxUndo(data: FinanceData) {
  const { confirm, toast } = useApp();
  const accountName = (id?: string) => (id ? data.accounts.find((a) => a.id === id)?.name : undefined);

  /** Desfaz as baixas: o dinheiro volta para a(s) conta(s) e o lançamento fica em aberto. */
  const undoPayment = async (t: Transaction): Promise<boolean> => {
    const income = t.type === 'receita';
    const byAccount = new Map<string, number>();
    t.payments.forEach((p) => byAccount.set(p.accountId ?? '', (byAccount.get(p.accountId ?? '') ?? 0) + p.amount));
    const lines = [...byAccount.entries()].map(([acc, amount]) =>
      acc
        ? `${formatBRL(amount)} ${income ? 'sai de novo da' : 'volta para a'} conta ${accountName(acc) ?? '(conta removida)'}`
        : `${formatBRL(amount)} foi registrado sem conta informada, então nenhum saldo muda`,
    );
    const interest = data.transactions.filter((x) => x.interestOf?.transactionId === t.id);
    const interestTotal = sum(interest.map((x) => x.amount));
    if (interestTotal > 0) lines.push(`os juros/multa de ${formatBRL(interestTotal)} lançados junto também são removidos (e o dinheiro volta para a conta)`);
    if (t.extraAdded) lines.push(`o valor volta a ser ${formatBRL(t.amount - t.extraAdded)} (sem os ${formatBRL(t.extraAdded)} somados no pagamento)`);
    const ok = await confirm({
      title: income ? 'Desfazer recebimento' : 'Desfazer baixa',
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            <b>{t.description}</b> volta para <b>“Em aberto”</b> {income ? 'em Contas a receber' : 'em Contas a pagar'} (vencimento {formatDateBR(t.date)}).
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      ),
      confirmLabel: income ? 'Desfazer recebimento' : 'Desfazer baixa',
    });
    if (!ok) return false;
    await reopenTransaction(t.id);
    const accs = [...byAccount.keys()].filter(Boolean).map(accountName).filter(Boolean);
    toast(accs.length ? `Em aberto de novo · ${formatBRL(paidAmount(t))} ${income ? 'saiu de' : 'voltou para'} ${accs.join(', ')}` : 'Em aberto de novo');
    return true;
  };

  /** Desfaz o pagamento no cartão (ou move uma compra do cartão para contas a pagar). */
  const undoCard = async (t: Transaction): Promise<boolean> => {
    if (!isCardTx(t)) return false;
    const group = t.billOrigin
      ? data.transactions.filter((x) => x.billOrigin?.billId === t.billOrigin!.billId && isCardTx(x))
      : t.installment
        ? data.transactions.filter((x) => x.installment?.groupId === t.installment!.groupId)
        : [t];
    const total = sum(group.map((x) => x.amount));
    const card = data.cards.find((c) => c.id === t.cardId);
    const months = [...new Set(group.map((x) => x.invoiceMonth).filter(Boolean) as string[])].sort();
    const ok = await confirm({
      title: t.billOrigin ? 'Desfazer pagamento no cartão' : 'Mover para contas a pagar',
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            {group.length > 1 ? `As ${group.length} parcelas` : 'O valor'} de <b>{formatBRL(total)}</b> {group.length > 1 ? 'saem' : 'sai'} do cartão <b>{card?.name ?? ''}</b>
            {months.length ? ` (fatura${months.length > 1 ? 's' : ''} de ${months.map(formatMonth).join(', ')})` : ''} e {group.length > 1 ? 'voltam' : 'volta'} a ser uma conta <b>em aberto</b> em Contas a pagar.
          </p>
          <p style={{ marginBottom: 0 }} className="small muted">
            Nenhum saldo de conta bancária muda, porque o pagamento no cartão não tira dinheiro da conta. Se a fatura já foi paga, confira o pagamento dela na tela de Cartões.
          </p>
        </>
      ),
      confirmLabel: t.billOrigin ? 'Desfazer pagamento' : 'Mover para contas a pagar',
    });
    if (!ok) return false;
    await moveCardPurchaseToBill(t.id);
    toast('Voltou para Contas a pagar, em aberto');
    return true;
  };

  return { undoPayment, undoCard };
}
