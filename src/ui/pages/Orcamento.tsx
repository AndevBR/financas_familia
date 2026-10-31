import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { currentMonth } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { budgetLevel, expensesOf } from '../../domain/reports';
import { setBudget } from '../../services/finance';
import { useApp } from '../AppContext';
import { Badge, MoneyInput, MonthPicker, Progress, StatCard } from '../components/ui';
import type { FinanceData } from '../hooks/useFinance';
import { useSeriesColor } from '../hooks/useTheme';

export function Orcamento({ data }: { data: FinanceData }) {
  const { toast } = useApp();
  const color = useSeriesColor();
  const [month, setMonth] = useState(currentMonth());
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
  const expenses = useMemo(() => expensesOf(data.transactions, month), [data.transactions, month]);
  const rows = data.categories
    .filter((c) => c.type === 'despesa')
    .map((c) => {
      const budget = data.budgets.find((b) => b.categoryId === c.id);
      const spent = sum(expenses.filter((t) => t.categoryId === c.id).map((t) => t.amount));
      const pct = budget ? (spent / budget.amount) * 100 : 0;
      return { c, budget, spent, pct, level: budget ? budgetLevel(pct) : undefined };
    })
    .sort((a, b) => (b.budget ? 1 : 0) - (a.budget ? 1 : 0) || b.pct - a.pct || b.spent - a.spent);
  const withBudget = rows.filter((r) => r.budget);
  const totalBudget = sum(withBudget.map((r) => r.budget!.amount));
  const totalSpent = sum(withBudget.map((r) => r.spent));
  const alerts = withBudget.filter((r) => r.level !== 'ok');

  const save = async (categoryId: string) => {
    const v = drafts[categoryId];
    if (v === undefined) return;
    await setBudget(categoryId, v ?? 0);
    setDrafts((d) => {
      const n = { ...d };
      delete n[categoryId];
      return n;
    });
    toast(v ? 'Limite salvo' : 'Limite removido');
  };

  return (
    <div className="stack">
      <div className="row between">
        <MonthPicker value={month} onChange={setMonth} />
        <span className="small muted">Os limites valem para todos os meses.</span>
      </div>
      <div className="stats">
        <StatCard label="Orçamento total" value={formatBRL(totalBudget)} sub={`${withBudget.length} categoria(s) com limite`} />
        <StatCard label="Consumido" value={formatBRL(totalSpent)} sub={totalBudget ? `${Math.round((totalSpent / totalBudget) * 100)}% do orçamento` : '—'} />
        <StatCard label="Ainda disponível" value={<span className={totalBudget - totalSpent < 0 ? 'expense' : 'income'}>{formatBRL(totalBudget - totalSpent)}</span>} />
      </div>
      {alerts.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {alerts.map((r) => (
            <div key={r.c.id} className={`alert ${r.level === 'estourado' ? 'critical' : 'warning'}`}>
              <AlertTriangle size={17} />
              <span>
                <b>{r.c.name}</b>: {r.level === 'estourado' ? `orçamento estourado em ${formatBRL(r.spent - r.budget!.amount)}` : `já consumiu ${Math.round(r.pct)}% do limite`} ({formatBRL(r.spent)} de {formatBRL(r.budget!.amount)}).
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Limites por categoria</h2>
            <p>Digite o limite mensal e pressione Enter. Deixe vazio para remover. Alertas aos 80% e 100%.</p>
          </div>
        </div>
        <div className="list">
          {rows.map(({ c, budget, spent, pct, level }) => (
            <div className="list-row" key={c.id} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="row between">
                  <span className="row strong" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: color(c.color) }} /> {c.name}
                  </span>
                  <span className="small">
                    <b className="num">{formatBRL(spent)}</b>
                    {budget && <span className="muted"> de {formatBRL(budget.amount)}</span>}{' '}
                    {level === 'estourado' && <Badge tone="critical">Estourado</Badge>}
                    {level === 'alerta' && <Badge tone="warning">{Math.round(pct)}%</Badge>}
                    {level === 'ok' && (
                      <Badge tone="good">
                        <CheckCircle2 size={11} /> {Math.round(pct)}%
                      </Badge>
                    )}
                  </span>
                </div>
                {budget ? (
                  <div style={{ marginTop: 6 }}>
                    <Progress value={pct} tone={level === 'estourado' ? 'critical' : level === 'alerta' ? 'warning' : undefined} label={c.name} />
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {budget.amount - spent >= 0 ? `Restam ${formatBRL(budget.amount - spent)}` : `Passou ${formatBRL(spent - budget.amount)}`}
                    </div>
                  </div>
                ) : (
                  <div className="tiny muted">Sem limite definido</div>
                )}
              </div>
              <div
                style={{ width: 150 }}
                onKeyDown={(e) => e.key === 'Enter' && save(c.id)}
                onBlur={() => save(c.id)}
              >
                <MoneyInput ariaLabel={`Limite ${c.name}`} placeholder="Limite R$" value={drafts[c.id] !== undefined ? drafts[c.id] : (budget?.amount ?? null)} onChange={(v) => setDrafts((d) => ({ ...d, [c.id]: v }))} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
