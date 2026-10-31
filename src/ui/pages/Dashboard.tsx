import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Clock, Lightbulb, PiggyBank, Target, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cardUsage } from '../../domain/cards';
import { addMonthKey, currentMonth, formatDateShort, formatMonth, today } from '../../domain/dates';
import { formatBRL, formatPercent } from '../../domain/money';
import { budgetStatus, byCard, byCategory, byMerchant, bySubcategory, expensesOf, monthSummary, monthlyEvolution, savingOpportunities } from '../../domain/reports';
import { isCardTx, isOverdue, openAmount, txStatus } from '../../domain/transactions';
import { useApp } from '../AppContext';
import { BarList, DonutChart, EvolutionChart, IncomeExpenseChart } from '../components/charts';
import { Badge, Delta, EmptyState, Money, MonthPicker, Progress, StatCard } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';
import { useSeriesColor } from '../hooks/useTheme';

export function Dashboard({ data, lookups }: { data: FinanceData; lookups: Lookups }) {
  const [month, setMonth] = useState(currentMonth());
  const { openEntry } = useApp();
  const color = useSeriesColor();
  const s = useMemo(() => monthSummary(data, month), [data, month]);
  const expenses = useMemo(() => expensesOf(data.transactions, month), [data.transactions, month]);
  const evolution = useMemo(() => monthlyEvolution(data.transactions, addMonthKey(month, -5), month), [data.transactions, month]);
  const cats = useMemo(() => byCategory(expenses, data.categories), [expenses, data.categories]);
  const subs = useMemo(() => bySubcategory(expenses, data.categories, data.subcategories), [expenses, data.categories, data.subcategories]);
  const merchants = useMemo(() => byMerchant(expenses), [expenses]);
  const cards = useMemo(() => byCard(expenses, data.cards), [expenses, data.cards]);
  const budgets = useMemo(() => budgetStatus(data, month).filter((b) => b.level !== 'ok'), [data, month]);
  const opportunities = useMemo(() => savingOpportunities(data, month).filter((o) => o.increase > 0).slice(0, 3), [data, month]);

  const ref = today();
  const upcoming = data.transactions
    .filter((t) => t.type === 'despesa' && !isCardTx(t) && txStatus(t) !== 'pago')
    .filter((t) => isOverdue(t, ref) || t.date.slice(0, 7) <= month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const overdueCount = data.transactions.filter((t) => isOverdue(t, ref)).length;

  if (data.loaded && data.transactions.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Wallet size={44} />} title="Bem-vindo ao Finanças da Família!">
          <p>Comece lançando uma despesa ou receita. Leva só alguns segundos.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn primary" onClick={() => openEntry({ type: 'despesa' })}>
              Lançar despesa
            </button>
            <button className="btn" onClick={() => openEntry({ type: 'receita' })}>
              Lançar receita
            </button>
            <Link className="btn" to="/contas">
              Configurar saldos das contas
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }


  return (
    <div className="stack">
      <div className="row between">
        <MonthPicker value={month} onChange={setMonth} />
        {overdueCount > 0 && (
          <Link to="/pagar" className="badge critical" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
            <AlertTriangle size={14} /> {overdueCount} conta(s) vencida(s)
          </Link>
        )}
      </div>

      <div className="stats six">
        <StatCard label="Recebemos" value={formatBRL(s.income)} tone="income" icon={<ArrowUpCircle size={18} />} sub={<>{s.toReceive > 0 ? `${formatBRL(s.toReceive)} ainda a receber` : 'Tudo recebido'} · <Delta value={s.incomeChange} invert /></>} />
        <StatCard label="Gastamos" value={formatBRL(s.expenses)} tone="expense" icon={<ArrowDownCircle size={18} />} sub={<>vs. mês anterior: <Delta value={s.expenseChange} /></>} />
        <StatCard label="Já pago" value={formatBRL(s.paid)} icon={<CheckCircle2 size={18} />} sub="Contas e faturas do mês" />
        <StatCard label="Falta pagar" value={formatBRL(s.toPay + s.overduePrevious)} icon={<Clock size={18} />} sub={s.overduePrevious > 0 ? `inclui ${formatBRL(s.overduePrevious)} vencido de meses anteriores` : 'Contas e faturas com vencimento no mês'} />
        <StatCard label="Disponível hoje" value={formatBRL(s.available)} icon={<Wallet size={18} />} sub="Saldo somado das contas" />
        <StatCard
          highlight
          label="Deve sobrar no fim do mês"
          value={formatBRL(s.projectedEnd)}
          icon={<PiggyBank size={18} />}
          sub={`Disponível + a receber − a pagar`}
        />
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="stat-label">Resultado do mês (receitas − despesas)</div>
          <div className={`stat-value ${s.result >= 0 ? 'income' : 'expense'}`}>{formatBRL(s.result)}</div>
          <div className="stat-sub">{s.income > 0 ? `${formatPercent(Math.max(0, (s.result / s.income) * 100))} da renda poupada` : 'Sem receitas lançadas no mês'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Categoria que mais consome</div>
          {s.topCategory ? (
            <>
              <div className="stat-value row" style={{ gap: 8 }}>
                <span className="dot" style={{ background: color(s.topCategory.color), width: 12, height: 12 }} />
                {s.topCategory.label}
              </div>
              <div className="stat-sub">
                {formatBRL(s.topCategory.total)} · {formatPercent(s.topCategory.percent)} dos gastos
              </div>
            </>
          ) : (
            <div className="stat-value muted">—</div>
          )}
        </div>
        <div className="card">
          <div className="stat-label">Comparado a {formatMonth(addMonthKey(month, -1))}</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {s.previous.expenses > 0 ? (
              s.expenses <= s.previous.expenses ? (
                <span className="income">{formatBRL(s.previous.expenses - s.expenses)} a menos</span>
              ) : (
                <span className="expense">{formatBRL(s.expenses - s.previous.expenses)} a mais</span>
              )
            ) : (
              <span className="muted">Sem dados</span>
            )}
          </div>
          <div className="stat-sub">Gastos no mês anterior: {formatBRL(s.previous.expenses)}</div>
        </div>
      </div>

      {(budgets.length > 0 || opportunities.length > 0) && (
        <div className="grid grid-2">
          {budgets.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 6 }}>
                  <Target size={17} /> Alertas de orçamento
                </h2>
                <Link to="/orcamento" className="small">
                  Ver orçamento
                </Link>
              </div>
              <div className="stack" style={{ gap: 12 }}>
                {budgets.slice(0, 4).map((b) => (
                  <div key={b.budget.id}>
                    <div className="row between small">
                      <span className="strong">{b.category?.name}</span>
                      <span>
                        {formatBRL(b.spent)} de {formatBRL(b.budget.amount)}{' '}
                        <Badge tone={b.level === 'estourado' ? 'critical' : 'warning'}>{b.level === 'estourado' ? 'Estourado' : `${Math.round(b.percent)}%`}</Badge>
                      </span>
                    </div>
                    <Progress value={b.percent} tone={b.level === 'estourado' ? 'critical' : 'warning'} label={b.category?.name} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {opportunities.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2 className="row" style={{ gap: 6 }}>
                  <Lightbulb size={17} /> Onde dá para economizar
                </h2>
                <Link to="/economia" className="small">
                  Ver oportunidades
                </Link>
              </div>
              <div className="list">
                {opportunities.map((o) => (
                  <div className="list-row" key={o.categoryId}>
                    <span className="dot" style={{ background: color(o.color) }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="strong">{o.name}</div>
                      <div className="small muted">{o.reason}</div>
                    </div>
                    <span className="expense small strong num">+{formatBRL(o.increase)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Receitas x despesas</h2>
              <p>Últimos 6 meses</p>
            </div>
          </div>
          <IncomeExpenseChart points={evolution} />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Despesas por categoria</h2>
              <p className="capitalize">{formatMonth(month)}</p>
            </div>
          </div>
          <DonutChart groups={cats} />
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-head">
            <h2>Por subcategoria</h2>
          </div>
          <BarList groups={subs} limit={7} emptyText="Nenhuma despesa no mês" />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Por estabelecimento</h2>
          </div>
          <BarList groups={merchants} limit={7} emptyText="Informe o estabelecimento nos lançamentos" />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Gastos por cartão</h2>
            <Link to="/cartoes" className="small">
              Faturas
            </Link>
          </div>
          {data.cards.length === 0 ? (
            <EmptyState title="Nenhum cartão cadastrado" />
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <BarList groups={cards} limit={5} emptyText="Sem compras no cartão no mês" />
              <div className="list">
                {data.cards
                  .filter((c) => !c.archived)
                  .map((c) => {
                    const u = cardUsage(c, data.transactions, data.invoicePayments);
                    return (
                      <div key={c.id} className="small" style={{ padding: '6px 0' }}>
                        <div className="row between">
                          <span>{c.name} · limite usado</span>
                          <span className="num">{formatPercent(u.usedPercent)}</span>
                        </div>
                        <Progress value={u.usedPercent} tone={u.usedPercent >= 100 ? 'critical' : u.usedPercent >= 80 ? 'warning' : undefined} label={`Limite ${c.name}`} />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Evolução mensal</h2>
              <p>Quanto sobrou a cada mês e o acumulado</p>
            </div>
          </div>
          <EvolutionChart points={evolution} />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Próximas contas a pagar</h2>
            <Link to="/pagar" className="small">
              Ver todas
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={32} />} title="Nenhuma conta pendente" />
          ) : (
            <div className="list">
              {upcoming.map((t) => {
                const cat = t.categoryId ? lookups.category.get(t.categoryId) : undefined;
                const late = isOverdue(t, ref);
                return (
                  <div className="list-row" key={t.id}>
                    <div className="num small" style={{ width: 44, color: late ? 'var(--critical)' : 'var(--text-3)', fontWeight: 600 }}>
                      {formatDateShort(t.date)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontWeight: 550 }}>
                        {t.description}
                      </div>
                      <div className="tiny muted">
                        {cat?.name ?? 'Sem categoria'} {late && <Badge tone="critical">Vencida</Badge>} {txStatus(t) === 'parcial' && <Badge tone="warning">Parcial</Badge>}
                      </div>
                    </div>
                    <Money value={openAmount(t)} className="strong" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
