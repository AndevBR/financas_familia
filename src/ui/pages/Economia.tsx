import { Lightbulb, PiggyBank, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addMonthKey, currentMonth, formatMonth } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { savingOpportunities, simulateSavings } from '../../domain/reports';
import { EmptyState, MonthPicker, StatCard } from '../components/ui';
import type { FinanceData } from '../hooks/useFinance';
import { useSeriesColor } from '../hooks/useTheme';

export function Economia({ data }: { data: FinanceData }) {
  const [month, setMonth] = useState(currentMonth());
  const color = useSeriesColor();
  const [cuts, setCuts] = useState<Record<string, number>>({});
  const ops = useMemo(() => savingOpportunities(data, month), [data, month]);
  const grew = ops.filter((o) => o.increase > 0 && o.average > 0);
  const monthly = simulateSavings(ops.map((o) => ({ baseMonthly: o.baseMonthly, reductionPercent: cuts[o.categoryId] ?? 0 })));
  const backToAverage = grew.reduce((a, o) => a + o.increase, 0);

  return (
    <div className="stack">
      <div className="row between">
        <MonthPicker value={month} onChange={setMonth} />
        <span className="small muted">Comparação com a média de {formatMonth(addMonthKey(month, -3))} a {formatMonth(addMonthKey(month, -1))}</span>
      </div>
      <div className="stats">
        <StatCard label="Categorias com aumento" value={String(grew.length)} icon={<TrendingUp size={18} />} sub="Acima da média dos últimos 3 meses" />
        <StatCard label="Voltando à média, economizaria" value={formatBRL(backToAverage)} icon={<Lightbulb size={18} />} sub="por mês" />
        <StatCard highlight label="Sua meta simulada" value={formatBRL(monthly)} icon={<PiggyBank size={18} />} sub={`por mês · ${formatBRL(monthly * 12)} em 1 ano`} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Oportunidades de economia</h2>
            <p>Categorias que cresceram e gastos não essenciais. Arraste para simular quanto reduzir.</p>
          </div>
          {Object.keys(cuts).length > 0 && (
            <button className="btn sm" onClick={() => setCuts({})}>
              Zerar simulação
            </button>
          )}
        </div>
        {ops.length === 0 ? (
          <EmptyState icon={<PiggyBank size={36} />} title="Nenhuma oportunidade encontrada neste mês">
            Seus gastos estão dentro da média. Continue lançando para análises mais precisas.
          </EmptyState>
        ) : (
          <div className="list">
            {ops.map((o) => {
              const cut = cuts[o.categoryId] ?? 0;
              return (
                <div key={o.categoryId} className="list-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="dot" style={{ background: color(o.color) }} />
                      <b>{o.name}</b>
                      {o.increase > 0 && o.average > 0 && <span className="badge critical">+{Math.round(o.increasePercent ?? 0)}%</span>}
                      {!o.essential && <span className="badge info">não essencial</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {o.reason}. Neste mês {formatBRL(o.current)} · média {formatBRL(o.average)}
                      {o.topSubcategory && ` · maior gasto em ${o.topSubcategory}`}
                      {o.topMerchant && ` · principal estabelecimento: ${o.topMerchant}`}
                    </div>
                  </div>
                  <div style={{ flex: '0 1 300px', minWidth: 220 }}>
                    <div className="row between small">
                      <span>Reduzir {cut}%</span>
                      <b className="income num">{formatBRL(Math.round((o.baseMonthly * cut) / 100))}/mês</b>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={cut}
                      aria-label={`Reduzir ${o.name}`}
                      style={{ width: '100%', accentColor: 'var(--brand)' }}
                      onChange={(e) => setCuts((c) => ({ ...c, [o.categoryId]: Number(e.target.value) }))}
                    />
                    <div className="chips">
                      {[10, 20, 30, 50].map((p) => (
                        <button key={p} className={`chip ${cut === p ? 'active' : ''}`} onClick={() => setCuts((c) => ({ ...c, [o.categoryId]: p }))}>
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
