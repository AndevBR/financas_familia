import { AlertTriangle, CreditCard, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInvoices } from '../../domain/cards';
import { addDays, currentMonth, formatDateBR, formatMonth, monthKey, today } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { isCardTx, isOverdue, openAmount, txStatus } from '../../domain/transactions';
import type { TxType } from '../../domain/types';
import { useApp } from '../AppContext';
import { TxTable } from '../components/TxTable';
import { Badge, MonthPicker, StatCard, Tabs } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';

type View = 'abertas' | 'vencidas' | 'quitadas' | 'todas';

/** Contas a pagar (type = despesa) ou a receber (type = receita). */
export function ContasPage({ type, data, lookups }: { type: TxType; data: FinanceData; lookups: Lookups }) {
  const { openEntry } = useApp();
  const [view, setView] = useState<View>('abertas');
  const [month, setMonth] = useState(currentMonth());
  const [allMonths, setAllMonths] = useState(true);
  const ref = today();
  const isPay = type === 'despesa';

  const base = useMemo(() => data.transactions.filter((t) => t.type === type && !isCardTx(t)), [data.transactions, type]);
  const list = useMemo(() => {
    let l = base;
    if (!allMonths) l = l.filter((t) => monthKey(t.date) === month);
    if (view === 'abertas') l = l.filter((t) => txStatus(t) !== 'pago');
    if (view === 'vencidas') l = l.filter((t) => isOverdue(t, ref));
    if (view === 'quitadas') l = l.filter((t) => txStatus(t) === 'pago');
    return [...l].sort((a, b) => (view === 'quitadas' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [base, view, month, allMonths, ref]);

  const open = base.filter((t) => txStatus(t) !== 'pago');
  const overdue = open.filter((t) => isOverdue(t, ref));
  const next7 = open.filter((t) => t.date >= ref && t.date <= addDays(ref, 7));

  const openInvoices = isPay
    ? data.cards.flatMap((c) => listInvoices(c, data.transactions, data.invoicePayments).filter((i) => i.open > 0 && i.closingDate <= ref).map((i) => ({ ...i, card: c })))
    : [];

  return (
    <div className="stack">
      <div className="stats">
        <StatCard label={isPay ? 'Total a pagar' : 'Total a receber'} value={formatBRL(sum(open.map(openAmount)))} sub={`${open.length} lançamento(s) em aberto`} />
        <StatCard label={isPay ? 'Vencidas' : 'Atrasadas'} value={<span style={{ color: overdue.length ? 'var(--critical)' : undefined }}>{formatBRL(sum(overdue.map(openAmount)))}</span>} sub={`${overdue.length} lançamento(s)`} icon={<AlertTriangle size={18} />} />
        <StatCard label="Próximos 7 dias" value={formatBRL(sum(next7.map(openAmount)))} sub={`${next7.length} lançamento(s)`} />
        {isPay && <StatCard label="Faturas de cartão fechadas" value={formatBRL(sum(openInvoices.map((i) => i.open)))} sub={`${openInvoices.length} fatura(s) em aberto`} icon={<CreditCard size={18} />} />}
      </div>

      {openInvoices.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Faturas de cartão a pagar</h2>
            <Link to="/cartoes" className="small">
              Ir para cartões
            </Link>
          </div>
          <div className="list">
            {openInvoices.map((i) => (
              <div className="list-row" key={`${i.cardId}-${i.month}`}>
                <CreditCard size={18} color={i.card.color} />
                <div style={{ flex: 1 }}>
                  <div className="strong">
                    {i.card.name} · fatura de {formatMonth(i.month)}
                  </div>
                  <div className="small muted">
                    Vence {formatDateBR(i.dueDate)} {i.status === 'vencida' && <Badge tone="critical">Vencida</Badge>} {i.paid > 0 && <Badge tone="warning">Parcial</Badge>}
                  </div>
                </div>
                <b className="num">{formatBRL(i.open)}</b>
                <Link className="btn sm" to={`/cartoes?card=${i.cardId}&fatura=${i.month}`}>
                  Pagar
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="row">
            {!allMonths && <MonthPicker value={month} onChange={setMonth} />}
            <label className="check small">
              <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} /> Todos os meses
            </label>
          </div>
          <button className="btn primary" onClick={() => openEntry({ type, paid: false, paymentMethod: isPay ? 'boleto' : 'pix' })}>
            <Plus size={16} /> {isPay ? 'Nova conta a pagar' : 'Nova receita prevista'}
          </button>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'abertas', label: `Em aberto (${open.length})` },
            { value: 'vencidas', label: `${isPay ? 'Vencidas' : 'Atrasadas'} (${overdue.length})` },
            { value: 'quitadas', label: isPay ? 'Pagas' : 'Recebidas' },
            { value: 'todas', label: 'Todas' },
          ]}
        />
        <TxTable
          txs={list}
          data={data}
          lookups={lookups}
          showOpen
          emptyText={view === 'abertas' ? (isPay ? 'Nenhuma conta em aberto 🎉' : 'Nenhum recebimento pendente') : 'Nada por aqui'}
        />
      </div>
    </div>
  );
}
