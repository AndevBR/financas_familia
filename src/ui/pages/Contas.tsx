import { AlertTriangle, CreditCard, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInvoices } from '../../domain/cards';
import { addDays, addMonthKey, currentMonth, formatDateBR, formatMonth, monthEnd, monthStart, today } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { isCardTx, isOverdue, openAmount, txStatus } from '../../domain/transactions';
import type { TxType } from '../../domain/types';
import { useApp } from '../AppContext';
import { TxTable } from '../components/TxTable';
import { Badge, Field, StatCard, Tabs } from '../components/ui';
import { CategorySelects } from '../components/TxFormModal';
import { filterTransactions, type TxFilters } from '../../domain/reports';
import type { FinanceData, Lookups } from '../hooks/useFinance';

type View = 'abertas' | 'vencidas' | 'quitadas' | 'todas';

/** Contas a pagar (type = despesa) ou a receber (type = receita). */
export function ContasPage({ type, data, lookups }: { type: TxType; data: FinanceData; lookups: Lookups }) {
  const { openEntry } = useApp();
  const [view, setView] = useState<View>('abertas');
  const [f, setF] = useState<TxFilters>({});
  const set = (p: Partial<TxFilters>) => setF((c) => ({ ...c, ...p }));
  const hasFilters = !!(f.search || f.categoryId || f.from || f.to);
  const ref = today();
  const isPay = type === 'despesa';

  // contas pagas no cartão continuam visíveis aqui (aba Pagas), uma linha por conta
  const base = useMemo(
    () => data.transactions.filter((t) => t.type === type && (!isCardTx(t) || t.billOrigin?.billId === t.id)),
    [data.transactions, type],
  );
  const filtered = useMemo(() => filterTransactions(base, f), [base, f]);
  const list = useMemo(() => {
    let l = filtered;
    if (view === 'abertas') l = l.filter((t) => txStatus(t) !== 'pago');
    if (view === 'vencidas') l = l.filter((t) => isOverdue(t, ref));
    if (view === 'quitadas') l = l.filter((t) => txStatus(t) === 'pago');
    return [...l].sort((a, b) => (view === 'quitadas' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [filtered, view, ref]);
  const listOpen = sum(list.map(openAmount));
  const listTotal = sum(list.map((t) => t.amount));

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
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{isPay ? 'Contas' : 'Recebimentos'}</h2>
          <button className="btn primary" onClick={() => openEntry({ type, paid: false, paymentMethod: isPay ? 'boleto' : 'pix' })}>
            <Plus size={16} /> {isPay ? 'Nova conta a pagar' : 'Nova receita prevista'}
          </button>
        </div>
        <div className="filters" style={{ marginBottom: 12 }}>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Buscar</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Descrição, estabelecimento ou observação"
                value={f.search ?? ''}
                onChange={(e) => set({ search: e.target.value })}
                aria-label="Buscar"
              />
            </div>
          </div>
          <CategorySelects filter data={data} type={type} categoryId={f.categoryId} subcategoryId={f.subcategoryId} onChange={(categoryId, subcategoryId) => set({ categoryId, subcategoryId })} />
          <Field label="Vencimento de">
            <input className="input" type="date" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="Vencimento de" />
          </Field>
          <Field label="Até">
            <input className="input" type="date" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="Vencimento até" />
          </Field>
        </div>
        <div className="row between small" style={{ marginBottom: 4 }}>
          <div className="chips">
            {[
              { label: 'Este mês', from: monthStart(currentMonth()), to: monthEnd(currentMonth()) },
              { label: 'Próximo mês', from: monthStart(addMonthKey(currentMonth(), 1)), to: monthEnd(addMonthKey(currentMonth(), 1)) },
              { label: 'Mês passado', from: monthStart(addMonthKey(currentMonth(), -1)), to: monthEnd(addMonthKey(currentMonth(), -1)) },
            ].map((p) => (
              <button key={p.label} className={`chip ${f.from === p.from && f.to === p.to ? 'active' : ''}`} onClick={() => set({ from: p.from, to: p.to })}>
                {p.label}
              </button>
            ))}
            {hasFilters && (
              <button className="chip" onClick={() => setF({})}>
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>
          <span className="muted">
            {list.length} lançamento(s) · total <b className="num">{formatBRL(listTotal)}</b>
            {listOpen > 0 && listOpen !== listTotal && (
              <>
                {' '}
                · em aberto <b className="num">{formatBRL(listOpen)}</b>
              </>
            )}
          </span>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'abertas', label: `Em aberto (${filtered.filter((t) => txStatus(t) !== 'pago').length})` },
            { value: 'vencidas', label: `${isPay ? 'Vencidas' : 'Atrasadas'} (${filtered.filter((t) => isOverdue(t, ref)).length})` },
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
