import { Pause, Pencil, Play, Plus, Repeat, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateBR, today } from '../../domain/dates';
import { formatBRL, sum } from '../../domain/money';
import { monthlyEquivalent, nextOccurrence } from '../../domain/recurrence';
import { detectRecurring } from '../../domain/reports';
import { findMerchant } from '../../domain/suggestions';
import { FREQUENCY_LABELS, PAYMENT_METHOD_LABELS, type Frequency, type PaymentMethod, type Recurrence } from '../../domain/types';
import { deleteRecurrence, saveRecurrence, setRecurrenceState } from '../../services/finance';
import { useApp } from '../AppContext';
import { CategorySelects } from '../components/TxFormModal';
import { Badge, EmptyState, Field, Modal, MoneyInput, Segmented } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';

type RecForm = Omit<Recurrence, 'id' | 'state' | 'generatedUntil'> & { id?: string };

function RecurrenceForm({ data, initial, onClose }: { data: FinanceData; initial: RecForm; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<RecForm>(initial);
  const [error, setError] = useState('');
  const set = (p: Partial<RecForm>) => setF((c) => ({ ...c, ...p }));
  const save = async () => {
    try {
      await saveRecurrence({ ...f, cardId: f.paymentMethod === 'credito' ? f.cardId : undefined, endDate: f.endDate || undefined });
      toast(f.id ? 'Recorrência atualizada' : 'Recorrência criada — lançamentos gerados');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={f.id ? 'Editar recorrência' : 'Nova despesa/receita recorrente'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Segmented
          value={f.type}
          onChange={(type) => set({ type, categoryId: undefined, subcategoryId: undefined, paymentMethod: type === 'receita' && f.paymentMethod === 'credito' ? 'pix' : f.paymentMethod })}
          options={[
            { value: 'despesa', label: 'Despesa', className: 'exp' },
            { value: 'receita', label: 'Receita', className: 'inc' },
          ]}
        />
        <div className="form-grid">
          <Field label="Descrição" className="full">
            <input className="input" autoFocus value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Internet, Escola, Netflix" />
          </Field>
          <Field label={f.variableAmount ? 'Valor estimado (R$)' : 'Valor (R$)'}>
            <MoneyInput value={f.amount} onChange={(v) => set({ amount: v ?? 0 })} />
          </Field>
          <Field label="Valor">
            <Segmented
              value={f.variableAmount ? 'var' : 'fixo'}
              onChange={(v) => set({ variableAmount: v === 'var' })}
              options={[
                { value: 'fixo', label: 'Fixo' },
                { value: 'var', label: 'Variável' },
              ]}
            />
          </Field>
          <Field label="Frequência">
            <select className="input" value={f.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((k) => (
                <option key={k} value={k}>
                  {FREQUENCY_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primeiro vencimento" hint="Define o dia das próximas ocorrências">
            <input className="input" type="date" value={f.startDate} disabled={!!f.id} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Termina em (opcional)">
            <input className="input" type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          <Field label="Estabelecimento (opcional)">
            <input className="input" value={f.merchant ?? ''} onChange={(e) => set({ merchant: e.target.value })} />
          </Field>
          <CategorySelects data={data} type={f.type} categoryId={f.categoryId} subcategoryId={f.subcategoryId} onChange={(categoryId, subcategoryId) => set({ categoryId, subcategoryId })} />
          <Field label="Forma de pagamento">
            <select className="input" value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
                .filter((m) => !(m === 'credito' && f.type === 'receita'))
                .map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
            </select>
          </Field>
          {f.paymentMethod === 'credito' ? (
            <Field label="Cartão">
              <select className="input" value={f.cardId ?? ''} onChange={(e) => set({ cardId: e.target.value || undefined })}>
                <option value="">Selecione</option>
                {data.cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Conta">
              <select className="input" value={f.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
                <option value="">Não informar</option>
                {data.accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {f.paymentMethod !== 'credito' && (
            <label className="check full">
              <input type="checkbox" checked={!!f.autoPay} onChange={(e) => set({ autoPay: e.target.checked })} />
              {f.type === 'receita' ? 'Marcar como recebido automaticamente' : 'Débito automático (lançar como pago)'}
            </label>
          )}
        </div>
        <div className="hint">Os lançamentos são criados automaticamente até o fim do próximo mês e aparecem em Contas a pagar/receber.</div>
        {error && <div className="alert critical">{error}</div>}
      </div>
    </Modal>
  );
}

const stateBadge = (r: Recurrence) =>
  r.state === 'ativa' ? <Badge tone="good">Ativa</Badge> : r.state === 'pausada' ? <Badge tone="warning">Pausada</Badge> : <Badge>Cancelada</Badge>;

export function Recorrentes({ data, lookups }: { data: FinanceData; lookups: Lookups }) {
  const { confirm, toast } = useApp();
  const [form, setForm] = useState<RecForm | null>(null);
  const ref = today();
  const blank = (): RecForm => ({ type: 'despesa', description: '', amount: 0, variableAmount: false, frequency: 'mensal', startDate: ref, paymentMethod: 'boleto', accountId: data.accounts[0]?.id });
  const list = [...data.recurrences].sort((a, b) => (a.state === b.state ? a.description.localeCompare(b.description, 'pt-BR') : a.state === 'ativa' ? -1 : 1));
  const active = list.filter((r) => r.state === 'ativa');
  const monthlyExpense = sum(active.filter((r) => r.type === 'despesa').map(monthlyEquivalent));
  const monthlyIncome = sum(active.filter((r) => r.type === 'receita').map(monthlyEquivalent));
  const detected = useMemo(() => {
    const known = new Set(data.recurrences.map((r) => (r.merchant ?? r.description).toLowerCase()));
    return detectRecurring(data.transactions).filter((d) => !known.has(d.merchant.toLowerCase())).slice(0, 5);
  }, [data.transactions, data.recurrences]);

  const changeState = async (r: Recurrence, state: Recurrence['state']) => {
    if (state !== 'ativa') {
      const ok = await confirm({
        title: state === 'pausada' ? 'Pausar recorrência' : 'Cancelar recorrência',
        message: `${state === 'pausada' ? 'Pausar' : 'Cancelar'} "${r.description}"? Os lançamentos futuros em aberto serão removidos; o histórico é mantido.`,
        confirmLabel: state === 'pausada' ? 'Pausar' : 'Cancelar recorrência',
        danger: state === 'cancelada',
      });
      if (!ok) return;
    }
    await setRecurrenceState(r.id, state);
    toast(state === 'ativa' ? 'Recorrência reativada' : state === 'pausada' ? 'Recorrência pausada' : 'Recorrência cancelada');
  };

  const remove = async (r: Recurrence) => {
    const choice = await confirm({
      title: 'Excluir recorrência',
      danger: true,
      message: `Excluir "${r.description}"? Lançamentos já pagos são mantidos no histórico.`,
      choices: [
        { value: 'open', label: 'Excluir e remover em aberto', danger: true },
        { value: 'keep', label: 'Excluir e manter lançamentos', danger: true },
      ],
    });
    if (!choice) return;
    await deleteRecurrence(r.id, { removeOpen: choice === 'open' });
    toast('Recorrência excluída');
  };

  return (
    <div className="stack">
      <div className="stats">
        <div className="card stat">
          <div className="stat-label">Despesas fixas por mês</div>
          <div className="stat-value expense">{formatBRL(monthlyExpense)}</div>
          <div className="stat-sub">{active.filter((r) => r.type === 'despesa').length} recorrência(s) ativa(s)</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Receitas fixas por mês</div>
          <div className="stat-value income">{formatBRL(monthlyIncome)}</div>
          <div className="stat-sub">Equivalente mensal</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Comprometimento da renda fixa</div>
          <div className="stat-value">{monthlyIncome ? `${Math.round((monthlyExpense / monthlyIncome) * 100)}%` : '—'}</div>
          <div className="stat-sub">Despesas fixas ÷ receitas fixas</div>
        </div>
      </div>

      {detected.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2 className="row" style={{ gap: 6 }}>
              <Sparkles size={16} /> Gastos que parecem recorrentes
            </h2>
          </div>
          <div className="list">
            {detected.map((d) => (
              <div className="list-row" key={d.merchant}>
                <div style={{ flex: 1 }}>
                  <div className="strong">{d.merchant}</div>
                  <div className="small muted">
                    Aparece em {d.months} meses · média {formatBRL(d.average)}/mês
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => {
                    const m = findMerchant(data.merchants, d.merchant);
                    setForm({ ...blank(), description: d.merchant, merchant: d.merchant, amount: d.average, variableAmount: true, categoryId: m?.lastCategoryId, subcategoryId: m?.lastSubcategoryId, paymentMethod: m?.lastPaymentMethod ?? 'pix', cardId: m?.lastCardId });
                  }}
                >
                  Tornar recorrente
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Recorrências</h2>
          <button className="btn primary" onClick={() => setForm(blank())}>
            <Plus size={16} /> Nova recorrência
          </button>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Repeat size={36} />} title="Nenhuma conta recorrente">
            Cadastre internet, energia, escola, assinaturas e salários para que sejam lançados automaticamente.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th className="hide-mobile">Frequência</th>
                  <th>Próxima</th>
                  <th>Status</th>
                  <th className="money">Valor</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const cat = r.categoryId ? lookups.category.get(r.categoryId) : undefined;
                  const next = nextOccurrence(r, ref) ?? undefined;
                  return (
                    <tr key={r.id} style={{ opacity: r.state === 'ativa' ? 1 : 0.65 }}>
                      <td>
                        <div className="tx-main">
                          <span className="strong" style={{ fontWeight: 550 }}>
                            {r.description}
                          </span>
                          <span className="tx-sub">
                            {cat && (
                              <span>
                                <span className="dot" style={{ background: cat.color }} /> {cat.name}
                              </span>
                            )}
                            <span>{r.paymentMethod === 'credito' ? lookups.card.get(r.cardId ?? '')?.name : PAYMENT_METHOD_LABELS[r.paymentMethod]}</span>
                            {r.autoPay && <span>débito automático</span>}
                          </span>
                        </div>
                      </td>
                      <td className="hide-mobile small">{FREQUENCY_LABELS[r.frequency]}</td>
                      <td className="small num">{next ? formatDateBR(next) : '—'}</td>
                      <td>{stateBadge(r)}</td>
                      <td className="money">
                        <span className={r.type === 'receita' ? 'income' : 'expense'}>{formatBRL(r.amount)}</span>
                        {r.variableAmount && <div className="tiny muted">variável</div>}
                      </td>
                      <td className="actions">
                        <button className="btn ghost sm icon" title="Editar" aria-label="Editar" onClick={() => setForm({ ...r })}>
                          <Pencil size={15} />
                        </button>
                        {r.state === 'ativa' ? (
                          <button className="btn ghost sm icon" title="Pausar" aria-label="Pausar" onClick={() => changeState(r, 'pausada')}>
                            <Pause size={15} />
                          </button>
                        ) : (
                          <button className="btn ghost sm icon" title="Reativar" aria-label="Reativar" onClick={() => changeState(r, 'ativa')}>
                            <Play size={15} />
                          </button>
                        )}
                        {r.state !== 'cancelada' && (
                          <button className="btn ghost sm icon" title="Cancelar" aria-label="Cancelar recorrência" onClick={() => changeState(r, 'cancelada')}>
                            <XCircle size={15} />
                          </button>
                        )}
                        <button className="btn ghost sm icon danger" title="Excluir" aria-label="Excluir" onClick={() => remove(r)}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <RecurrenceForm data={data} initial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
