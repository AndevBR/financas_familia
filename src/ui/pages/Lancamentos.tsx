import { Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { currentMonth, monthEnd, monthStart } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { filterTransactions, type TxFilters } from '../../domain/reports';
import { exportCSV, transactionsSheet } from '../../services/export';
import { useApp } from '../AppContext';
import { CategorySelects } from '../components/TxFormModal';
import { TxTable } from '../components/TxTable';
import { MonthPicker } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';

export function Lancamentos({ data, lookups }: { data: FinanceData; lookups: Lookups }) {
  const { openEntry } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const [allPeriod, setAllPeriod] = useState(false);
  const [f, setF] = useState<TxFilters>({ type: '' });
  const set = (p: Partial<TxFilters>) => setF((c) => ({ ...c, ...p }));

  const filters: TxFilters = { ...f, ...(allPeriod ? {} : { from: monthStart(month), to: monthEnd(month) }) };
  const txs = useMemo(
    () => filterTransactions(data.transactions, filters, data.cards).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.transactions, data.cards, JSON.stringify(filters)],
  );
  const income = sum(txs.filter((t) => t.type === 'receita').map((t) => t.amount));
  const expense = sum(txs.filter((t) => t.type === 'despesa').map((t) => t.amount));
  const merchants = [...new Set(data.transactions.map((t) => t.merchant).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          {!allPeriod && <MonthPicker value={month} onChange={setMonth} />}
          <label className="check small">
            <input type="checkbox" checked={allPeriod} onChange={(e) => setAllPeriod(e.target.checked)} /> Todo o período
          </label>
        </div>
        <div className="row">
          <button className="btn" onClick={() => exportCSV(`lancamentos-${allPeriod ? 'todos' : month}`, transactionsSheet(txs, data))}>
            <Download size={15} /> CSV
          </button>
          <button className="btn primary" onClick={() => openEntry()}>
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Buscar</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Descrição, estabelecimento ou observação" value={f.search ?? ''} onChange={(e) => set({ search: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={f.type ?? ''} onChange={(e) => set({ type: e.target.value as TxFilters['type'], categoryId: undefined, subcategoryId: undefined })}>
              <option value="">Todos</option>
              <option value="despesa">Despesas</option>
              <option value="receita">Receitas</option>
            </select>
          </div>
          {f.type && <CategorySelects filter data={data} type={f.type} categoryId={f.categoryId} subcategoryId={f.subcategoryId} onChange={(categoryId, subcategoryId) => set({ categoryId, subcategoryId })} />}
          <div className="field">
            <label>Estabelecimento</label>
            <select className="input" value={f.merchant ?? ''} onChange={(e) => set({ merchant: e.target.value || undefined })}>
              <option value="">Todos</option>
              {merchants.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" value={f.status ?? ''} onChange={(e) => set({ status: e.target.value as TxFilters['status'] })}>
              <option value="">Todos</option>
              <option value="pago">Pago / recebido</option>
              <option value="aberto">Em aberto</option>
              <option value="vencido">Vencido</option>
            </select>
          </div>
          <div className="field">
            <label>Cartão</label>
            <select className="input" value={f.cardId ?? ''} onChange={(e) => set({ cardId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {data.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Pessoa</label>
            <select className="input" value={f.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{txs.length} lançamento(s)</h2>
          <div className="row small">
            <span>
              Receitas <b className="income num">{formatBRL(income)}</b>
            </span>
            <span>
              Despesas <b className="expense num">{formatBRL(expense)}</b>
            </span>
            <span>
              Saldo <b className="num">{formatBRL(income - expense)}</b>
            </span>
          </div>
        </div>
        <TxTable txs={txs} data={data} lookups={lookups} />
      </div>
    </div>
  );
}
