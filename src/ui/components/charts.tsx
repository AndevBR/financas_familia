import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonth, formatMonthShort } from '../../domain/dates';
import { formatBRL, formatBRLCompact, formatPercent } from '../../domain/money';
import type { GroupTotal, MonthPoint } from '../../domain/reports';
import { useChartTheme, useSeriesColor } from '../hooks/useTheme';
import { EmptyState, Progress } from './ui';
import { BarChart3 } from 'lucide-react';

type TooltipRow = { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

function MoneyTooltip({ active, payload, label, labelFormatter }: { active?: boolean; payload?: TooltipRow[]; label?: string; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <div className="t">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div className="r" key={String(p.dataKey ?? p.name)}>
          <span className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </span>
          <b className="num">{formatBRL(p.value ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = (color: string) => ({ tick: { fill: color, fontSize: 12 }, axisLine: false, tickLine: false });

export function IncomeExpenseChart({ points, height = 260 }: { points: MonthPoint[]; height?: number }) {
  const th = useChartTheme();
  if (points.every((p) => !p.income && !p.expenses)) return <EmptyState icon={<BarChart3 size={32} />} title="Sem movimentação no período" />;
  return (
    <>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span>
          <span className="dot" style={{ background: th.income }} /> Receitas
        </span>
        <span>
          <span className="dot" style={{ background: th.expense }} /> Despesas
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={points} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} {...axisProps(th.axis)} />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} width={72} {...axisProps(th.axis)} />
          <Tooltip cursor={{ fill: th.grid, opacity: 0.5 }} content={<MoneyTooltip labelFormatter={formatMonth} />} />
          <Bar dataKey="income" name="Receitas" fill={th.income} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} />
          <Bar dataKey="expenses" name="Despesas" fill={th.expense} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export function EvolutionChart({ points, height = 260 }: { points: MonthPoint[]; height?: number }) {
  const th = useChartTheme();
  if (points.every((p) => !p.income && !p.expenses)) return <EmptyState icon={<BarChart3 size={32} />} title="Sem movimentação no período" />;
  return (
    <>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span>
          <span className="dot" style={{ background: th.income }} /> Sobra do mês
        </span>
        <span>
          <span className="dot" style={{ background: th.accent }} /> Economia acumulada
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points}>
          <CartesianGrid vertical={false} stroke={th.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} {...axisProps(th.axis)} />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} width={72} {...axisProps(th.axis)} />
          <Tooltip content={<MoneyTooltip labelFormatter={formatMonth} />} />
          <Area type="monotone" dataKey="accumulated" name="Economia acumulada" stroke={th.accent} strokeWidth={2} fill={th.accent} fillOpacity={0.12} animationDuration={500} />
          <Line type="monotone" dataKey="result" name="Sobra do mês" stroke={th.income} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: th.surface }} activeDot={{ r: 5 }} animationDuration={500} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

/** Rosca com no máximo 6 fatias; o restante é agrupado em "Outros". */
export function DonutChart({ groups, height = 220 }: { groups: GroupTotal[]; height?: number }) {
  const color = useSeriesColor();
  const th = useChartTheme();
  if (!groups.length) return <EmptyState icon={<BarChart3 size={32} />} title="Nenhuma despesa no período" />;
  const top = groups.slice(0, 6);
  const rest = groups.slice(6);
  const slices = rest.length
    ? [...top, { key: '__outros', label: `Outros (${rest.length})`, total: rest.reduce((a, g) => a + g.total, 0), count: 0, percent: rest.reduce((a, g) => a + g.percent, 0), color: '#a3a29b' }]
    : top;
  const total = groups.reduce((a, g) => a + g.total, 0);
  return (
    <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ width: 200, height, position: 'relative', flex: '0 0 auto', margin: '0 auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="total" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1} stroke={th.surface} strokeWidth={2} animationDuration={500}>
              {slices.map((s) => (
                <Cell key={s.key} fill={color(s.color)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const g = payload[0].payload as GroupTotal;
                return (
                  <div className="chart-tooltip">
                    <div className="t">{g.label}</div>
                    <div className="r">
                      <b className="num">{formatBRL(g.total)}</b>
                      <span className="muted">{formatPercent(g.percent)}</span>
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div className="tiny muted">Total</div>
            <div className="strong num">{formatBRLCompact(total)}</div>
          </div>
        </div>
      </div>
      <div className="list" style={{ flex: '1 1 200px', minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.key} className="row" style={{ justifyContent: 'space-between', padding: '5px 0', flexWrap: 'nowrap' }}>
            <span className="row ellipsis small" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span className="dot" style={{ background: color(s.color) }} />
              <span className="ellipsis">{s.label}</span>
            </span>
            <span className="small num" style={{ whiteSpace: 'nowrap' }}>
              {formatBRL(s.total)} <span className="muted">· {formatPercent(s.percent)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranking em barras horizontais (HTML), legível em qualquer largura. */
export function BarList({ groups, limit = 8, emptyText = 'Nada para mostrar', onSelect }: { groups: GroupTotal[]; limit?: number; emptyText?: string; onSelect?: (g: GroupTotal) => void }) {
  const color = useSeriesColor();
  if (!groups.length) return <EmptyState icon={<BarChart3 size={32} />} title={emptyText} />;
  const max = groups[0].total || 1;
  return (
    <div className="bar-list">
      {groups.slice(0, limit).map((g, i) => (
        <div
          key={g.key}
          className="bar-item"
          title={`${g.label}: ${formatBRL(g.total)} (${formatPercent(g.percent, 1)}) em ${g.count} lançamento(s)`}
          style={{ ['--bar-color' as string]: color(g.color ?? '#2a78d6'), cursor: onSelect ? 'pointer' : undefined }}
          onClick={() => onSelect?.(g)}
        >
          <span className="ellipsis">
            <span className="muted num" style={{ marginRight: 6 }}>
              {i + 1}.
            </span>
            {g.label}
          </span>
          <span className="num strong">
            {formatBRL(g.total)} <span className="muted small" style={{ fontWeight: 400 }}>{formatPercent(g.percent)}</span>
          </span>
          <Progress value={(g.total / max) * 100} label={g.label} />
        </div>
      ))}
    </div>
  );
}
