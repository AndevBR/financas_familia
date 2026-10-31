import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildInvoice, cardUsage, currentInvoiceMonth, INVOICE_STATUS_LABELS, installmentPlans, type Invoice } from '../../domain/cards';
import { addMonthKey, formatDateBR, formatMonth, formatMonthShort, today } from '../../domain/dates';
import { formatBRL, formatPercent } from '../../domain/money';
import type { Card } from '../../domain/types';
import { deleteCard, deleteInvoicePayment, payInvoice, saveCard } from '../../services/finance';
import { useApp } from '../AppContext';
import { TxTable } from '../components/TxTable';
import { Badge, EmptyState, Field, Modal, MoneyInput, Progress } from '../components/ui';
import type { FinanceData, Lookups } from '../hooks/useFinance';

const CARD_COLORS = ['#0f766e', '#6d28d9', '#1d4ed8', '#be123c', '#111827', '#c2410c', '#15803d'];

function CardForm({ data, card, onClose }: { data: FinanceData; card?: Card; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Omit<Card, 'id'> & { id?: string }>(
    card ?? { name: '', holderId: data.people[0]?.id, limit: 0, closingDay: 1, dueDay: 10, color: CARD_COLORS[data.cards.length % CARD_COLORS.length], defaultAccountId: data.accounts[0]?.id },
  );
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await saveCard({ ...f, closingDay: Number(f.closingDay), dueDay: Number(f.dueDay) });
      toast(card ? 'Cartão atualizado' : 'Cartão cadastrado');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={card ? 'Editar cartão' : 'Novo cartão'}
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
      <div className="form-grid">
        <Field label="Nome do cartão" className="full">
          <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Nubank do João" />
        </Field>
        <Field label="Titular">
          <select className="input" value={f.holderId ?? ''} onChange={(e) => setF({ ...f, holderId: e.target.value || undefined })}>
            <option value="">Não informar</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Limite (R$)">
          <MoneyInput value={f.limit} onChange={(v) => setF({ ...f, limit: v ?? 0 })} />
        </Field>
        <Field label="Dia de fechamento" hint="Compras a partir deste dia vão para a próxima fatura">
          <input className="input" type="number" min={1} max={31} value={f.closingDay} onChange={(e) => setF({ ...f, closingDay: Number(e.target.value) })} />
        </Field>
        <Field label="Dia de vencimento">
          <input className="input" type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })} />
        </Field>
        <Field label="Conta usada para pagar a fatura">
          <select className="input" value={f.defaultAccountId ?? ''} onChange={(e) => setF({ ...f, defaultAccountId: e.target.value || undefined })}>
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
        <Field label="Cor">
          <div className="chips">
            {CARD_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setF({ ...f, color: c })} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: f.color === c ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
        </Field>
      </div>
      {error && <div className="alert critical mt">{error}</div>}
    </Modal>
  );
}

function PayInvoiceModal({ data, card, invoice, onClose }: { data: FinanceData; card: Card; invoice: Invoice; onClose: () => void }) {
  const { toast } = useApp();
  const [amount, setAmount] = useState<number | null>(invoice.open);
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(card.defaultAccountId ?? data.accounts.find((a) => !a.archived)?.id ?? '');
  const [error, setError] = useState('');
  const save = async () => {
    try {
      if (!amount || amount <= 0) throw new Error('Informe um valor maior que zero.');
      await payInvoice({ cardId: card.id, invoiceMonth: invoice.month, amount, date, accountId: accountId || undefined });
      toast(amount < invoice.open ? 'Pagamento parcial da fatura registrado' : 'Fatura paga');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={`Pagar fatura de ${formatMonth(invoice.month)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Confirmar pagamento
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="alert info">
          O pagamento da fatura apenas tira o dinheiro da conta. As compras já foram contabilizadas nas suas categorias — nada é duplicado.
        </div>
        <div className="form-grid">
          <Field label="Valor" hint={`Em aberto: ${formatBRL(invoice.open)}`} className="full">
            <MoneyInput big autoFocus value={amount} onChange={setAmount} />
          </Field>
          <Field label="Data do pagamento">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Pago com a conta">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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
        </div>
        {error && <div className="alert critical">{error}</div>}
      </div>
    </Modal>
  );
}

const invoiceTone = (s: Invoice['status']) => (s === 'paga' ? 'good' : s === 'vencida' ? 'critical' : s === 'parcial' || s === 'fechada' ? 'warning' : 'info');

export function Cartoes({ data, lookups }: { data: FinanceData; lookups: Lookups }) {
  const { openEntry, confirm, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const cards = data.cards.filter((c) => !c.archived);
  const selectedId = params.get('card') ?? cards[0]?.id;
  const card = data.cards.find((c) => c.id === selectedId);
  const [month, setMonth] = useState<string | undefined>(params.get('fatura') ?? undefined);
  const [form, setForm] = useState<{ card?: Card } | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);

  useEffect(() => {
    if (card && !month) setMonth(currentInvoiceMonth(card));
  }, [card, month]);

  const invoice = card && month ? buildInvoice(card, month, data.transactions, data.invoicePayments) : undefined;
  const invoiceMonths = useMemo(() => {
    if (!card) return [];
    const cur = currentInvoiceMonth(card);
    const set = new Set<string>([cur, addMonthKey(cur, 1), addMonthKey(cur, -1), addMonthKey(cur, -2)]);
    data.transactions.forEach((t) => t.cardId === card.id && t.invoiceMonth && set.add(t.invoiceMonth));
    return [...set].sort();
  }, [card, data.transactions]);
  const plans = useMemo(() => installmentPlans(data.transactions.filter((t) => t.cardId === selectedId)).filter((p) => p.remainingAmount > 0), [data.transactions, selectedId]);
  const payments = data.invoicePayments.filter((p) => p.cardId === selectedId && p.invoiceMonth === month);

  const select = (id: string) => {
    setParams({ card: id });
    const c = data.cards.find((x) => x.id === id);
    setMonth(c ? currentInvoiceMonth(c) : undefined);
  };

  const remove = async (c: Card) => {
    const n = data.transactions.filter((t) => t.cardId === c.id).length;
    const ok = await confirm({
      title: 'Excluir cartão',
      danger: true,
      message: (
        <>
          Excluir o cartão <b>{c.name}</b>? {n > 0 && <>As {n} compra(s) lançadas nele e os pagamentos de fatura também serão excluídos.</>}
        </>
      ),
      confirmLabel: 'Excluir cartão',
    });
    if (!ok) return;
    await deleteCard(c.id);
    setParams({});
    setMonth(undefined);
    toast('Cartão excluído');
  };

  return (
    <div className="stack">
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          Compras no cartão entram nas categorias pela data da compra. O pagamento da fatura só movimenta a conta bancária.
        </p>
        <button className="btn primary" onClick={() => setForm({})}>
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState icon={<CreditCard size={40} />} title="Nenhum cartão cadastrado">
            Cadastre os cartões da família para acompanhar faturas, parcelas e limite.
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-3">
          {cards.map((c) => {
            const u = cardUsage(c, data.transactions, data.invoicePayments);
            const cur = buildInvoice(c, currentInvoiceMonth(c), data.transactions, data.invoicePayments);
            return (
              <div key={c.id} className={`credit-card ${c.id === selectedId ? 'selected' : ''}`} style={{ background: `linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 65%, #000))` }} onClick={() => select(c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(c.id)}>
                <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
                  <div>
                    <div className="strong">{c.name}</div>
                    <div className="tiny" style={{ opacity: 0.8 }}>
                      {(c.holderId && lookups.person.get(c.holderId)?.name) || 'Sem titular'} · fecha dia {c.closingDay} · vence dia {c.dueDay}
                    </div>
                  </div>
                  <CreditCard size={22} />
                </div>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div className="tiny" style={{ opacity: 0.8 }}>
                    Fatura atual ({formatMonthShort(cur.month)})
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700 }} className="num">
                    {formatBRL(cur.total)}
                  </div>
                  <div className="row between tiny" style={{ margin: '6px 0 4px', opacity: 0.9 }}>
                    <span>Usado {formatBRL(u.used)}</span>
                    <span>Disponível {formatBRL(u.available)}</span>
                  </div>
                  <Progress value={u.usedPercent} label={`Limite usado ${formatPercent(u.usedPercent)}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {card && invoice && (
        <div className="grid grid-21">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>
                  {card.name} · fatura de {formatMonth(invoice.month)}
                </h2>
                <p>
                  Fecha em {formatDateBR(invoice.closingDate)} · vence em {formatDateBR(invoice.dueDate)}
                </p>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setForm({ card })}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn sm danger" onClick={() => remove(card)}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {invoiceMonths.map((m) => (
                <button key={m} className={`chip ${m === month ? 'active' : ''}`} onClick={() => setMonth(m)}>
                  {formatMonthShort(m)}
                </button>
              ))}
            </div>
            <div className="stats" style={{ marginBottom: 14 }}>
              <div>
                <div className="stat-label">Total</div>
                <div className="stat-value">{formatBRL(invoice.total)}</div>
              </div>
              <div>
                <div className="stat-label">Pago</div>
                <div className="stat-value income">{formatBRL(invoice.paid)}</div>
              </div>
              <div>
                <div className="stat-label">Em aberto</div>
                <div className="stat-value">{formatBRL(invoice.open)}</div>
              </div>
              <div>
                <div className="stat-label">Status</div>
                <div style={{ marginTop: 8 }}>
                  <Badge tone={invoiceTone(invoice.status)}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                </div>
              </div>
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn primary" disabled={invoice.open <= 0} onClick={() => setPaying(invoice)}>
                Pagar fatura
              </button>
              <button className="btn" onClick={() => openEntry({ type: 'despesa', paymentMethod: 'credito', cardId: card.id })}>
                <Plus size={15} /> Nova compra
              </button>
            </div>
            {payments.length > 0 && (
              <div className="list" style={{ marginBottom: 12 }}>
                {payments.map((p) => (
                  <div className="list-row small" key={p.id}>
                    <span className="muted">Pagamento em {formatDateBR(p.date)}</span>
                    <span>{p.accountId ? lookups.account.get(p.accountId)?.name : ''}</span>
                    <span className="spacer" />
                    <b className="num">{formatBRL(p.amount)}</b>
                    <button
                      className="btn ghost sm icon danger"
                      aria-label="Excluir pagamento"
                      onClick={async () => {
                        if (await confirm({ title: 'Excluir pagamento da fatura', danger: true, message: `Excluir o pagamento de ${formatBRL(p.amount)}?`, confirmLabel: 'Excluir' })) {
                          await deleteInvoicePayment(p.id);
                          toast('Pagamento excluído');
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <TxTable txs={invoice.items} data={data} lookups={lookups} compact emptyText="Nenhuma compra nesta fatura" />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Parcelamentos em andamento</h2>
            </div>
            {plans.length === 0 ? (
              <EmptyState title="Nenhuma compra parcelada" />
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {plans.map((p) => (
                  <div key={p.groupId}>
                    <div className="row between small">
                      <span className="strong ellipsis">{p.description}</span>
                      <span className="num">{formatBRL(p.totalAmount)}</span>
                    </div>
                    <Progress value={(p.paidCount / p.total) * 100} label={p.description} />
                    <div className="row between tiny muted" style={{ marginTop: 3 }}>
                      <span>
                        {p.paidCount}/{p.total} parcelas · falta {formatBRL(p.remainingAmount)}
                      </span>
                      <span>até {p.lastInvoice ? formatMonthShort(p.lastInvoice) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {form && <CardForm data={data} card={form.card} onClose={() => setForm(null)} />}
      {paying && card && <PayInvoiceModal data={data} card={card} invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

