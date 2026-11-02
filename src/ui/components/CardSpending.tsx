import { PieChart as PieIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cardPurchases } from '../../domain/cards';
import { addMonthKey, formatMonth } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { byCategory, byMerchant, bySubcategory } from '../../domain/reports';
import type { Card, MonthKey } from '../../domain/types';
import type { FinanceData } from '../hooks/useFinance';
import { BarList, DonutChart } from './charts';
import { EmptyState, Segmented } from './ui';

type Scope = 'cartao' | 'todos';
type Period = 'fatura' | '3' | '12';
type Group = 'categoria' | 'subcategoria' | 'estabelecimento';

/** "Onde está o gasto do cartão": compras agrupadas por categoria, subcategoria e estabelecimento. */
export function CardSpending({ data, card, invoiceMonth }: { data: FinanceData; card: Card; invoiceMonth: MonthKey }) {
  const [scope, setScope] = useState<Scope>('cartao');
  const [period, setPeriod] = useState<Period>('fatura');
  const [group, setGroup] = useState<Group>('categoria');

  const months = period === 'fatura' ? 1 : Number(period);
  const fromInvoice = addMonthKey(invoiceMonth, -(months - 1));
  const items = useMemo(
    () => cardPurchases(data.transactions, { cardId: scope === 'cartao' ? card.id : undefined, fromInvoice, toInvoice: invoiceMonth }),
    [data.transactions, scope, card.id, fromInvoice, invoiceMonth],
  );
  const total = sum(items.map((t) => t.amount));
  const cats = useMemo(() => byCategory(items, data.categories), [items, data.categories]);
  const groups = useMemo(
    () => (group === 'categoria' ? cats : group === 'subcategoria' ? bySubcategory(items, data.categories, data.subcategories) : byMerchant(items)),
    [group, cats, items, data.categories, data.subcategories],
  );
  const periodLabel = period === 'fatura' ? `fatura de ${formatMonth(invoiceMonth)}` : `faturas de ${formatMonth(fromInvoice)} a ${formatMonth(invoiceMonth)}`;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="row" style={{ gap: 6 }}>
            <PieIcon size={17} /> Onde está o gasto {scope === 'cartao' ? `do ${card.name}` : 'dos cartões'}
          </h2>
          <p>
            {periodLabel} · {items.length} compra(s) · total <b className="num">{formatBRL(total)}</b>
            {period !== 'fatura' && total > 0 && ` · média ${formatBRL(Math.round(total / months))}/fatura`}
          </p>
        </div>
        <div className="row">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'cartao', label: 'Este cartão' },
              { value: 'todos', label: 'Todos os cartões' },
            ]}
          />
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'fatura', label: 'Fatura' },
              { value: '3', label: '3 faturas' },
              { value: '12', label: '12 faturas' },
            ]}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<PieIcon size={32} />} title="Nenhuma compra no período">
          As compras lançadas no cartão aparecem aqui separadas por categoria.
        </EmptyState>
      ) : (
        <div className="grid grid-2">
          <div>
            <h3 style={{ marginBottom: 10 }}>Por categoria</h3>
            <DonutChart groups={cats} />
          </div>
          <div>
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3>Ranking</h3>
              <Segmented
                value={group}
                onChange={setGroup}
                options={[
                  { value: 'categoria', label: 'Categoria' },
                  { value: 'subcategoria', label: 'Subcategoria' },
                  { value: 'estabelecimento', label: 'Estabelecimento' },
                ]}
              />
            </div>
            <BarList groups={groups} limit={8} emptyText="Informe o estabelecimento nas compras" />
          </div>
        </div>
      )}
    </div>
  );
}
