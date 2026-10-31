import { Check, CreditCard, Pencil, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { formatDateBR, formatMonthShort, today } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { isCardTx, isOverdue, openAmount, paidAmount, statusLabel, txStatus } from '../../domain/transactions';
import type { Transaction } from '../../domain/types';
import { deleteTransaction, reopenTransaction, settleTransaction } from '../../services/finance';
import { useApp } from '../AppContext';
import type { FinanceData, Lookups } from '../hooks/useFinance';
import { Badge, EmptyState, Money } from './ui';
import { AttachmentButton } from './Attachments';

export function StatusBadge({ t }: { t: Transaction }) {
  const label = statusLabel(t);
  if (isCardTx(t)) return <Badge tone="info">Na fatura {t.invoiceMonth ? formatMonthShort(t.invoiceMonth) : ''}</Badge>;
  if (isOverdue(t)) return <Badge tone="critical">{label}</Badge>;
  const s = txStatus(t);
  if (s === 'pago') return <Badge tone="good">{label}</Badge>;
  if (s === 'parcial') return <Badge tone="warning">Parcial</Badge>;
  return <Badge>{label}</Badge>;
}

export function TxTable({
  txs,
  data,
  lookups,
  emptyText = 'Nenhum lançamento encontrado',
  showOpen,
  compact,
}: {
  txs: Transaction[];
  data: FinanceData;
  lookups: Lookups;
  emptyText?: string;
  /** Exibe coluna de valor em aberto (contas a pagar/receber). */
  showOpen?: boolean;
  compact?: boolean;
}) {
  const { openEdit, openPayment, openAttachments, confirm, toast } = useApp();
  const attachCount = new Map<string, number>();
  data.attachments.forEach((a) => a.transactionId && attachCount.set(a.transactionId, (attachCount.get(a.transactionId) ?? 0) + 1));
  if (!txs.length) return <EmptyState title={emptyText} />;

  const remove = async (t: Transaction) => {
    const choice = await confirm({
      title: 'Excluir lançamento',
      danger: true,
      message: t.installment ? (
        <>Esta compra foi parcelada em {t.installment.total}x. O que deseja excluir?</>
      ) : (
        <>
          Excluir <b>{t.description}</b> ({formatBRL(t.amount)})? Esta ação não pode ser desfeita.
        </>
      ),
      choices: t.installment
        ? [
            { value: 'one', label: 'Só esta parcela', danger: true },
            { value: 'all', label: 'Todas as parcelas', danger: true },
          ]
        : [{ value: 'one', label: 'Excluir', danger: true }],
    });
    if (!choice) return;
    const n = await deleteTransaction(t.id, { wholeGroup: choice === 'all' });
    toast(n > 1 ? `${n} parcelas excluídas` : 'Lançamento excluído');
  };

  const quickSettle = async (t: Transaction) => {
    await settleTransaction(t.id, today(), t.accountId ?? data.accounts.find((a) => !a.archived)?.id);
    toast(t.type === 'receita' ? 'Marcado como recebido' : 'Marcado como pago');
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            {!compact && <th className="hide-mobile">Categoria</th>}
            {!compact && <th className="hide-mobile">Pagamento</th>}
            <th>Status</th>
            <th className="money">Valor</th>
            {showOpen && <th className="money hide-mobile">Em aberto</th>}
            <th className="actions" aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {txs.map((t) => {
            const cat = t.categoryId ? lookups.category.get(t.categoryId) : undefined;
            const sub = t.subcategoryId ? lookups.subcategory.get(t.subcategoryId) : undefined;
            const st = txStatus(t);
            return (
              <tr key={t.id}>
                <td className="num small">{formatDateBR(t.date)}</td>
                <td style={{ maxWidth: 320 }}>
                  <div className="tx-main">
                    <span className="ellipsis strong" style={{ fontWeight: 550 }}>
                      {t.description}
                    </span>
                    <span className="tx-sub">
                      {t.merchant && t.merchant !== t.description && <span>{t.merchant}</span>}
                      {t.recurrenceId && (
                        <span title="Recorrente">
                          <Repeat size={11} /> recorrente
                        </span>
                      )}
                      {t.estimated && <Badge tone="warning">valor estimado</Badge>}
                      {compact && cat && (
                        <span>
                          <span className="dot" style={{ background: cat.color }} /> {cat.name}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                {!compact && (
                  <td className="hide-mobile small">
                    {cat ? (
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <span className="dot" style={{ background: cat.color }} />
                        <span className="ellipsis">
                          {cat.name}
                          {sub && <span className="muted"> › {sub.name}</span>}
                        </span>
                      </span>
                    ) : (
                      <span className="muted">Sem categoria</span>
                    )}
                  </td>
                )}
                {!compact && (
                  <td className="hide-mobile small muted">
                    {t.cardId ? (
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <CreditCard size={13} /> {lookups.card.get(t.cardId)?.name ?? 'Cartão'}
                      </span>
                    ) : (
                      (t.accountId && lookups.account.get(t.accountId)?.name) || '—'
                    )}
                  </td>
                )}
                <td>
                  <StatusBadge t={t} />
                </td>
                <td className="money">
                  <Money value={t.amount} type={t.type} signed />
                </td>
                {showOpen && (
                  <td className="money hide-mobile small">
                    {formatBRL(openAmount(t))}
                    {paidAmount(t) > 0 && openAmount(t) > 0 && <div className="tiny muted">pago {formatBRL(paidAmount(t))}</div>}
                  </td>
                )}
                <td className="actions">
                  {!isCardTx(t) && st !== 'pago' && (
                    <>
                      <button className="btn sm" onClick={() => openPayment(t)} title="Registrar pagamento (total ou parcial)">
                        {t.type === 'receita' ? 'Receber' : 'Pagar'}
                      </button>{' '}
                      <button className="btn ghost sm icon" onClick={() => quickSettle(t)} title="Quitar hoje" aria-label="Quitar hoje">
                        <Check size={15} />
                      </button>
                    </>
                  )}
                  {!isCardTx(t) && st === 'pago' && showOpen && (
                    <button className="btn ghost sm icon" onClick={() => reopenTransaction(t.id).then(() => toast('Reaberto'))} title="Desfazer baixa" aria-label="Desfazer baixa">
                      <RotateCcw size={15} />
                    </button>
                  )}
                  {(!isCardTx(t) || attachCount.get(t.id)) && (
                    <AttachmentButton
                      count={attachCount.get(t.id) ?? 0}
                      onClick={() => openAttachments({ link: { transactionId: t.id }, title: t.description, subtitle: `${formatDateBR(t.date)} · ${formatBRL(t.amount)}` })}
                    />
                  )}
                  <button className="btn ghost sm icon" onClick={() => openEdit(t)} title="Editar" aria-label="Editar">
                    <Pencil size={15} />
                  </button>
                  <button className="btn ghost sm icon danger" onClick={() => remove(t)} title="Excluir" aria-label="Excluir">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
