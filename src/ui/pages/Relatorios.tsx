import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addMonthKey, currentMonth, diffDays, addDays, formatDateBR, formatMonth, monthEnd, monthKey, monthStart } from '../../domain/dates';
import { formatBRL, formatPercent, sum } from '../../domain/money';
import { monthlyEquivalent } from '../../domain/recurrence';
import {
  byCategory,
  byMerchant,
  bySubcategory,
  byCard,
  compareCategories,
  detectRecurring,
  filterTransactions,
  monthlyEvolution,
  topExpenses,
  type GroupTotal,
  type TxFilters,
} from '../../domain/reports';
import { exportCSV, exportPDF, exportXLSX, transactionsSheet, type Sheet } from '../../services/export';
import { useApp } from '../AppContext';
import { BarList, DonutChart, EvolutionChart, IncomeExpenseChart } from '../components/charts';
import { CategorySelects } from '../components/TxFormModal';
import { TxTable } from '../components/TxTable';
import { Delta, EmptyState, Field, Tabs } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';

type Preset = 'mes' | 'anterior' | '3m' | '6m' | '12m' | 'ano' | 'custom';
type Tab = 'resumo' | 'ranking' | 'meses' | 'crescimento' | 'recorrentes' | 'economias' | 'lancamentos';

function presetRange(p: Preset): { from: string; to: string } {
  const cm = currentMonth();
  switch (p) {
    case 'mes':
      return { from: monthStart(cm), to: monthEnd(cm) };
    case 'anterior':
      return { from: monthStart(addMonthKey(cm, -1)), to: monthEnd(addMonthKey(cm, -1)) };
    case '3m':
      return { from: monthStart(addMonthKey(cm, -2)), to: monthEnd(cm) };
    case '6m':
      return { from: monthStart(addMonthKey(cm, -5)), to: monthEnd(cm) };
    case '12m':
      return { from: monthStart(addMonthKey(cm, -11)), to: monthEnd(cm) };
    case 'ano':
      return { from: `${cm.slice(0, 4)}-01-01`, to: `${cm.slice(0, 4)}-12-31` };
    default:
      return { from: monthStart(cm), to: monthEnd(cm) };
  }
}

const groupSheet = (name: string, groups: GroupTotal[]): Sheet => ({
  name,
  headers: ['Posição', 'Nome', 'Lançamentos', 'Total (R$)', '% do total'],
  moneyCols: [3],
  rows: groups.map((g, i) => [i + 1, g.label, g.count, g.total / 100, `${g.percent.toFixed(1).replace('.', ',')}%`]),
});

export function Relatorios({ data, lookups }: { data: FinanceData; lookups: Lookups }) {
  const { toast } = useApp();
  const [preset, setPreset] = useState<Preset>('mes');
  const [range, setRange] = useState(presetRange('mes'));
  const [f, setF] = useState<TxFilters>({ type: 'despesa' });
  const [tab, setTab] = useState<Tab>('resumo');
  const set = (p: Partial<TxFilters>) => setF((c) => ({ ...c, ...p }));

  const filters: TxFilters = { ...f, ...range };
  const filtersNoType: TxFilters = { ...filters, type: '' };
  const key = JSON.stringify(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txs = useMemo(() => filterTransactions(data.transactions, filters, data.cards), [data.transactions, data.cards, key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allTypes = useMemo(() => filterTransactions(data.transactions, filtersNoType, data.cards), [data.transactions, data.cards, key]);
  const expenses = txs.filter((t) => t.type === 'despesa');
  const cats = useMemo(() => byCategory(txs, data.categories), [txs, data.categories]);
  const subs = useMemo(() => bySubcategory(txs, data.categories, data.subcategories), [txs, data.categories, data.subcategories]);
  const merchants = useMemo(() => byMerchant(txs), [txs]);
  const cardsG = useMemo(() => byCard(txs, data.cards), [txs, data.cards]);
  const months = useMemo(() => monthlyEvolution(allTypes, monthKey(range.from), monthKey(range.to)), [allTypes, range]);

  const days = diffDays(range.to, range.from) + 1;
  const prevRange = { from: addDays(range.from, -days), to: addDays(range.from, -1) };
  // período anterior com mesmo tamanho; se o período for meses inteiros, compara meses inteiros
  const isWholeMonths = range.from.endsWith('-01') && range.to === monthEnd(monthKey(range.to));
  const nMonths = isWholeMonths ? (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 + Number(range.to.slice(5, 7)) - Number(range.from.slice(5, 7)) + 1 : 0;
  const compareRange = isWholeMonths ? { from: monthStart(addMonthKey(monthKey(range.from), -nMonths)), to: monthEnd(addMonthKey(monthKey(range.from), -1)) } : prevRange;
  const comparison = useMemo(() => {
    const base = filterTransactions(data.transactions, { ...f, type: 'despesa' }, data.cards);
    return compareCategories(base, data.categories, range, compareRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transactions, data.categories, key]);
  const recurringTx = expenses.filter((t) => t.recurrenceId);
  const detected = useMemo(() => detectRecurring(data.transactions), [data.transactions]);
  const total = sum(txs.map((t) => t.amount));
  const periodLabel = `${formatDateBR(range.from)} a ${formatDateBR(range.to)}`;

  const sheets = (): Sheet[] => [
    groupSheet('Por categoria', cats),
    groupSheet('Por subcategoria', subs),
    groupSheet('Por estabelecimento', merchants),
    groupSheet('Por cartão', cardsG),
    {
      name: 'Comparação mensal',
      headers: ['Mês', 'Receitas (R$)', 'Despesas (R$)', 'Resultado (R$)', 'Acumulado (R$)'],
      moneyCols: [1, 2, 3, 4],
      rows: months.map((m) => [formatMonth(m.month), m.income / 100, m.expenses / 100, m.result / 100, m.accumulated / 100]),
    },
    {
      name: 'Crescimento',
      headers: ['Categoria', 'Período atual (R$)', 'Período anterior (R$)', 'Diferença (R$)', 'Variação'],
      moneyCols: [1, 2, 3],
      rows: comparison.map((c) => [c.name, c.current / 100, c.previous / 100, c.diff / 100, c.diffPercent == null ? 'novo' : `${c.diffPercent.toFixed(0)}%`]),
    },
    transactionsSheet(txs, data),
  ];

  const doExport = async (kind: 'xlsx' | 'csv' | 'pdf') => {
    const name = `relatorio-${range.from}-a-${range.to}`;
    try {
      if (kind === 'csv') exportCSV(name, transactionsSheet(txs, data));
      if (kind === 'xlsx') await exportXLSX(name, sheets());
      if (kind === 'pdf') {
        const s = sheets();
        await exportPDF(name, 'Relatório financeiro da família', `${periodLabel} · ${txs.length} lançamentos · total ${formatBRL(total)}`, [s[0], s[2], s[4], s[5], { ...s[6], rows: s[6].rows.slice(0, 300) }]);
      }
      toast('Exportação concluída');
    } catch (e) {
      toast(`Falha ao exportar: ${(e as Error).message}`, 'error');
    }
  };

  const merchantsList = [...new Set(data.transactions.map((t) => t.merchant).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <div className="stack">
      <div className="card">
        <div className="filters">
          <Field label="Período">
            <select
              className="input"
              value={preset}
              onChange={(e) => {
                const p = e.target.value as Preset;
                setPreset(p);
                if (p !== 'custom') setRange(presetRange(p));
              }}
            >
              <option value="mes">Este mês</option>
              <option value="anterior">Mês anterior</option>
              <option value="3m">Últimos 3 meses</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Últimos 12 meses</option>
              <option value="ano">Este ano</option>
              <option value="custom">Personalizado</option>
            </select>
          </Field>
          <Field label="De">
            <input className="input" type="date" value={range.from} onChange={(e) => (setPreset('custom'), setRange({ ...range, from: e.target.value }))} />
          </Field>
          <Field label="Até">
            <input className="input" type="date" value={range.to} onChange={(e) => (setPreset('custom'), setRange({ ...range, to: e.target.value }))} />
          </Field>
          <Field label="Tipo">
            <select className="input" value={f.type ?? ''} onChange={(e) => set({ type: e.target.value as TxFilters['type'], categoryId: undefined, subcategoryId: undefined })}>
              <option value="despesa">Despesas</option>
              <option value="receita">Receitas</option>
            </select>
          </Field>
          {f.type && <CategorySelects filter data={data} type={f.type} categoryId={f.categoryId} subcategoryId={f.subcategoryId} onChange={(categoryId, subcategoryId) => set({ categoryId, subcategoryId })} />}
          <Field label="Estabelecimento">
            <select className="input" value={f.merchant ?? ''} onChange={(e) => set({ merchant: e.target.value || undefined })}>
              <option value="">Todos</option>
              {merchantsList.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Pessoa">
            <select className="input" value={f.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cartão">
            <select className="input" value={f.cardId ?? ''} onChange={(e) => set({ cardId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {data.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={f.status ?? ''} onChange={(e) => set({ status: e.target.value as TxFilters['status'] })}>
              <option value="">Todos</option>
              <option value="pago">Pago / recebido</option>
              <option value="aberto">Em aberto</option>
              <option value="vencido">Vencido</option>
            </select>
          </Field>
        </div>
        <div className="row between mt">
          <div className="small muted">
            {periodLabel} · <b>{txs.length}</b> lançamentos · total <b className="num">{formatBRL(total)}</b>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => doExport('xlsx')}>
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button className="btn sm" onClick={() => doExport('csv')}>
              <FileDown size={15} /> CSV
            </button>
            <button className="btn sm" onClick={() => doExport('pdf')}>
              <FileText size={15} /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'resumo', label: 'Resumo' },
            { value: 'ranking', label: 'Rankings' },
            { value: 'meses', label: 'Comparação entre meses' },
            { value: 'crescimento', label: 'O que mais cresceu' },
            { value: 'recorrentes', label: 'Gastos recorrentes' },
            { value: 'economias', label: 'Evolução das economias' },
            { value: 'lancamentos', label: 'Lançamentos' },
          ]}
        />

        {tab === 'resumo' && (
          <div className="grid grid-2">
            <div>
              <h3 style={{ marginBottom: 10 }}>Por categoria</h3>
              <DonutChart groups={cats} />
            </div>
            <div>
              <h3 style={{ marginBottom: 10 }}>Maiores {f.type === 'receita' ? 'receitas' : 'despesas'}</h3>
              {txs.length === 0 ? (
                <EmptyState title="Nada no período" />
              ) : (
                <div className="list">
                  {(f.type === 'receita' ? [...txs].sort((a, b) => b.amount - a.amount).slice(0, 8) : topExpenses(txs, 8)).map((t) => (
                    <div key={t.id} className="list-row small">
                      <span className="muted num">{formatDateBR(t.date)}</span>
                      <span className="ellipsis" style={{ flex: 1 }}>
                        {t.description}
                        <span className="muted"> · {t.categoryId ? lookups.category.get(t.categoryId)?.name : 'Sem categoria'}</span>
                      </span>
                      <b className="num">{formatBRL(t.amount)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ranking' && (
          <div className="grid grid-3">
            <div>
              <h3 style={{ marginBottom: 12 }}>Categorias</h3>
              <BarList groups={cats} limit={15} onSelect={(g) => set({ categoryId: g.key === '__none__' ? undefined : g.key, subcategoryId: undefined })} />
            </div>
            <div>
              <h3 style={{ marginBottom: 12 }}>Subcategorias</h3>
              <BarList groups={subs} limit={15} />
            </div>
            <div>
              <h3 style={{ marginBottom: 12 }}>Estabelecimentos</h3>
              <BarList groups={merchants} limit={15} emptyText="Sem estabelecimentos informados" onSelect={(g) => set({ merchant: g.label })} />
            </div>
          </div>
        )}

        {tab === 'meses' && (
          <div className="stack">
            <IncomeExpenseChart points={months} height={280} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="money">Receitas</th>
                    <th className="money">Despesas</th>
                    <th className="money">Resultado</th>
                    <th className="money">Variação das despesas</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={m.month}>
                      <td className="capitalize">{formatMonth(m.month)}</td>
                      <td className="money income">{formatBRL(m.income)}</td>
                      <td className="money expense">{formatBRL(m.expenses)}</td>
                      <td className="money strong">{formatBRL(m.result)}</td>
                      <td className="money small">{i === 0 ? '—' : <Delta value={months[i - 1].expenses ? ((m.expenses - months[i - 1].expenses) / months[i - 1].expenses) * 100 : null} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'crescimento' && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              Despesas de {periodLabel} comparadas com {formatDateBR(compareRange.from)} a {formatDateBR(compareRange.to)}.
            </p>
            {comparison.length === 0 ? (
              <EmptyState title="Sem despesas para comparar" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th className="money">Período anterior</th>
                      <th className="money">Período atual</th>
                      <th className="money">Diferença</th>
                      <th className="money">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((c) => (
                      <tr key={c.categoryId}>
                        <td>
                          <span className="dot" style={{ background: c.color, marginRight: 8 }} />
                          {c.name}
                        </td>
                        <td className="money">{formatBRL(c.previous)}</td>
                        <td className="money">{formatBRL(c.current)}</td>
                        <td className={`money strong ${c.diff > 0 ? 'expense' : 'income'}`}>
                          {c.diff > 0 ? '+' : ''}
                          {formatBRL(c.diff)}
                        </td>
                        <td className="money">{c.diffPercent == null ? <span className="badge warning">novo</span> : <Delta value={c.diffPercent} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'recorrentes' && (
          <div className="grid grid-2">
            <div>
              <h3 style={{ marginBottom: 10 }}>Recorrências cadastradas</h3>
              {data.recurrences.filter((r) => r.state === 'ativa' && r.type === 'despesa').length === 0 ? (
                <EmptyState title="Nenhuma recorrência ativa" />
              ) : (
                <div className="list">
                  {data.recurrences
                    .filter((r) => r.state === 'ativa' && r.type === 'despesa')
                    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))
                    .map((r) => (
                      <div className="list-row small" key={r.id}>
                        <span style={{ flex: 1 }}>{r.description}</span>
                        <b className="num">{formatBRL(monthlyEquivalent(r))}/mês</b>
                      </div>
                    ))}
                </div>
              )}
              <div className="small muted mt">
                Lançado no período por recorrências: <b>{formatBRL(sum(recurringTx.map((t) => t.amount)))}</b> ({formatPercent(total ? (sum(recurringTx.map((t) => t.amount)) / total) * 100 : 0)} das despesas filtradas)
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 10 }}>Gastos que se repetem todo mês</h3>
              {detected.length === 0 ? (
                <EmptyState title="Nenhum padrão encontrado ainda" />
              ) : (
                <div className="list">
                  {detected.map((d) => (
                    <div className="list-row small" key={d.merchant}>
                      <span style={{ flex: 1 }}>
                        {d.merchant} <span className="muted">· {d.months} meses</span>
                      </span>
                      <b className="num">{formatBRL(d.average)}/mês</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'economias' && (
          <div className="stack">
            <EvolutionChart points={months} height={300} />
            <div className="stats">
              <div>
                <div className="stat-label">Economia no período</div>
                <div className={`stat-value ${(months.at(-1)?.accumulated ?? 0) >= 0 ? 'income' : 'expense'}`}>{formatBRL(months.at(-1)?.accumulated ?? 0)}</div>
              </div>
              <div>
                <div className="stat-label">Média por mês</div>
                <div className="stat-value">{formatBRL(Math.round((months.at(-1)?.accumulated ?? 0) / Math.max(1, months.length)))}</div>
              </div>
              <div>
                <div className="stat-label">Melhor mês</div>
                <div className="stat-value capitalize" style={{ fontSize: '1.1rem' }}>
                  {months.length ? formatMonth([...months].sort((a, b) => b.result - a.result)[0].month) : '—'}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'lancamentos' && <TxTable txs={[...txs].sort((a, b) => b.date.localeCompare(a.date))} data={data} lookups={lookups} />}
      </div>
    </div>
  );
}
