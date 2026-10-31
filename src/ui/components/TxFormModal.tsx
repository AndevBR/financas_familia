import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { invoiceMonthFor } from '../../domain/cards';
import { addDays, formatMonth, today } from '../../domain/dates';
import { formatBRL, splitAmount } from '../../domain/money';
import { findMerchant, recentCombos, searchMerchants } from '../../domain/suggestions';
import { txStatus, validateEntry, type QuickEntryInput } from '../../domain/transactions';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type Transaction, type TxType } from '../../domain/types';
import { deleteTransaction, saveQuickEntry, updateTransaction } from '../../services/finance';
import { useApp } from '../AppContext';
import type { FinanceData } from '../hooks/useFinance';
import { Autocomplete, Field, Modal, MoneyInput, Segmented } from './ui';

interface Props {
  data: FinanceData;
  onClose: () => void;
  prefill?: Partial<QuickEntryInput>;
  editing?: Transaction;
}

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function CategorySelects({
  data,
  type,
  categoryId,
  subcategoryId,
  onChange,
  filter,
}: {
  data: FinanceData;
  type: TxType;
  categoryId?: string;
  subcategoryId?: string;
  onChange: (categoryId?: string, subcategoryId?: string) => void;
  /** Uso em filtros: opção vazia significa "todas". */
  filter?: boolean;
}) {
  const cats = data.categories.filter((c) => c.type === type);
  const subs = data.subcategories.filter((s) => s.categoryId === categoryId);
  return (
    <>
      <Field label="Categoria">
        <select className="input" value={categoryId ?? ''} onChange={(e) => onChange(e.target.value || undefined, undefined)} aria-label="Categoria">
          <option value="">{filter ? 'Todas' : 'Sem categoria'}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subcategoria">
        <select
          className="input"
          value={subcategoryId ?? ''}
          disabled={!categoryId || subs.length === 0}
          onChange={(e) => onChange(categoryId, e.target.value || undefined)}
          aria-label="Subcategoria"
        >
          <option value="">{filter ? 'Todas' : categoryId ? 'Nenhuma' : 'Escolha a categoria'}</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function initialState(data: FinanceData, prefill?: Partial<QuickEntryInput>, editing?: Transaction): QuickEntryInput {
  if (editing) {
    return {
      type: editing.type,
      description: editing.description,
      amount: editing.amount,
      date: editing.date,
      categoryId: editing.categoryId,
      subcategoryId: editing.subcategoryId,
      merchant: editing.merchant ?? '',
      paymentMethod: editing.paymentMethod,
      accountId: editing.accountId ?? editing.payments[0]?.accountId,
      cardId: editing.cardId,
      personId: editing.personId,
      paid: txStatus(editing) === 'pago',
      notes: editing.notes ?? '',
      installments: 1,
    };
  }
  const type = prefill?.type ?? 'despesa';
  const last = [...data.transactions].filter((t) => t.type === type && !t.recurrenceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const accounts = data.accounts.filter((a) => !a.archived);
  const paymentMethod = prefill?.paymentMethod ?? last?.paymentMethod ?? 'pix';
  return {
    type,
    description: '',
    amount: 0,
    date: today(),
    merchant: '',
    paymentMethod: paymentMethod === 'credito' && data.cards.length === 0 ? 'pix' : paymentMethod,
    accountId: last?.accountId ?? accounts[0]?.id,
    cardId: last?.cardId ?? data.cards.find((c) => !c.archived)?.id,
    paid: true,
    installments: 1,
    notes: '',
    ...prefill,
  };
}

export function TxFormModal({ data, onClose, prefill, editing }: Props) {
  const { toast, confirm } = useApp();
  const [f, setF] = useState<QuickEntryInput>(() => initialState(data, prefill, editing));
  const [more, setMore] = useState(!!editing && !!(editing.notes || editing.personId));
  const [errors, setErrors] = useState<string[]>([]);
  const [initialPaid] = useState(f.paid);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<QuickEntryInput>) => setF((cur) => ({ ...cur, ...patch }));

  const isCredit = f.paymentMethod === 'credito';
  const card = data.cards.find((c) => c.id === f.cardId);
  const accounts = data.accounts.filter((a) => !a.archived || a.id === f.accountId);
  const combos = useMemo(() => (editing ? [] : recentCombos(data.transactions, f.type, 6)), [data.transactions, f.type, editing]);
  const merchantSuggestions = useMemo(
    () =>
      searchMerchants(data.merchants, f.merchant ?? '', 8).map((m) => ({
        value: m.name,
        hint: [data.categories.find((c) => c.id === m.lastCategoryId)?.name, data.subcategories.find((s) => s.id === m.lastSubcategoryId)?.name]
          .filter(Boolean)
          .join(' › '),
      })),
    [data.merchants, data.categories, data.subcategories, f.merchant],
  );

  /** Preenche a classificação a partir da memória do estabelecimento. */
  const applyMerchant = (name: string) => {
    const m = findMerchant(data.merchants, name);
    const patch: Partial<QuickEntryInput> = { merchant: name };
    if (m) {
      const cat = data.categories.find((c) => c.id === m.lastCategoryId);
      if (cat && cat.type === f.type) {
        patch.categoryId = cat.id;
        patch.subcategoryId = m.lastSubcategoryId;
      }
      if (m.lastPaymentMethod && !(m.lastPaymentMethod === 'credito' && f.type === 'receita')) patch.paymentMethod = m.lastPaymentMethod;
      if (m.lastCardId && data.cards.some((c) => c.id === m.lastCardId)) patch.cardId = m.lastCardId;
      if (m.lastAccountId && data.accounts.some((a) => a.id === m.lastAccountId && !a.archived)) patch.accountId = m.lastAccountId;
    }
    set(patch);
  };

  const submit = async (e?: FormEvent, again = false) => {
    e?.preventDefault();
    const input: QuickEntryInput = { ...f, installments: isCredit ? f.installments : 1 };
    const errs = validateEntry(input, card);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, {
          description: f.description ?? '',
          amount: f.amount,
          date: f.date,
          categoryId: f.categoryId,
          subcategoryId: f.subcategoryId,
          merchant: f.merchant,
          paymentMethod: f.paymentMethod,
          accountId: f.accountId,
          cardId: isCredit ? f.cardId : undefined,
          personId: f.personId,
          notes: f.notes,
          // só altera as baixas se o usuário mudou o status (preserva pagamentos parciais)
          paid: isCredit ? undefined : editing.cardId || f.paid !== initialPaid ? f.paid : undefined,
        });
        toast('Lançamento atualizado');
        onClose();
      } else {
        const txs = await saveQuickEntry(input);
        toast(txs.length > 1 ? `Compra lançada em ${txs.length} parcelas` : f.type === 'receita' ? 'Receita lançada' : 'Despesa lançada');
        if (again) {
          setF({ ...initialState(data, { type: f.type }), date: f.date, paymentMethod: f.paymentMethod, accountId: f.accountId, cardId: f.cardId });
          setErrors([]);
          setTimeout(() => document.getElementById('qe-amount')?.focus(), 30);
        } else onClose();
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const choice = await confirm({
      title: 'Excluir lançamento',
      danger: true,
      message: editing.installment ? (
        <>Esta compra foi parcelada em {editing.installment.total}x. O que deseja excluir?</>
      ) : (
        <>
          Excluir <b>{editing.description}</b> ({formatBRL(editing.amount)})? Esta ação não pode ser desfeita.
        </>
      ),
      choices: editing.installment
        ? [
            { value: 'one', label: 'Só esta parcela', danger: true },
            { value: 'all', label: 'Todas as parcelas', danger: true },
          ]
        : [{ value: 'one', label: 'Excluir', danger: true }],
    });
    if (!choice) return;
    const n = await deleteTransaction(editing.id, { wholeGroup: choice === 'all' });
    toast(n > 1 ? `${n} parcelas excluídas` : 'Lançamento excluído');
    onClose();
  };

  const installmentPreview =
    isCredit && card && f.amount > 0 && (f.installments ?? 1) >= 1
      ? `${(f.installments ?? 1) > 1 ? `${f.installments}x de ${formatBRL(splitAmount(f.amount, f.installments!)[1] ?? f.amount)} · ` : ''}1ª parcela na fatura de ${formatMonth(invoiceMonthFor(f.date, card))}`
      : undefined;

  const paidLabel = f.type === 'receita' ? ['Recebido', 'A receber'] : ['Pago', 'Em aberto'];
  const title = editing
    ? `Editar ${editing.type === 'receita' ? 'receita' : 'despesa'}${editing.installment ? ` · parcela ${editing.installment.number}/${editing.installment.total}` : ''}`
    : 'Novo lançamento';

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button type="button" className="btn danger" onClick={remove} style={{ marginRight: 'auto' }}>
              Excluir
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          {!editing && (
            <button type="button" className="btn hide-mobile" disabled={saving} onClick={() => submit(undefined, true)}>
              Salvar e novo
            </button>
          )}
          <button type="submit" form="tx-form" className="btn primary" disabled={saving}>
            {editing ? 'Salvar alterações' : 'Salvar'} <kbd className="hide-mobile">Enter</kbd>
          </button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <div className="row between">
          <Segmented
            value={f.type}
            onChange={(type) =>
              set({ type, categoryId: undefined, subcategoryId: undefined, paymentMethod: type === 'receita' && f.paymentMethod === 'credito' ? 'pix' : f.paymentMethod })
            }
            options={[
              { value: 'despesa', label: 'Despesa', className: 'exp' },
              { value: 'receita', label: 'Receita', className: 'inc' },
            ]}
          />
          {!isCredit && (
            <Segmented
              value={f.paid ? 'sim' : 'nao'}
              onChange={(v) => set({ paid: v === 'sim' })}
              options={[
                { value: 'sim', label: paidLabel[0] },
                { value: 'nao', label: paidLabel[1] },
              ]}
            />
          )}
        </div>

        <div className="form-grid">
          <Field label="Valor (R$)" error={errors.find((e) => e.includes('valor'))}>
            <MoneyInput id="qe-amount" ariaLabel="Valor" big autoFocus={!editing} value={f.amount} onChange={(v) => set({ amount: v ?? 0 })} />
          </Field>
          <Field label="Data">
            <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} aria-label="Data" style={{ minHeight: 52 }} />
            {!editing && (
              <div className="chips" style={{ marginTop: 2 }}>
                <button type="button" className={`chip ${f.date === today() ? 'active' : ''}`} onClick={() => set({ date: today() })}>
                  Hoje
                </button>
                <button type="button" className={`chip ${f.date === addDays(today(), -1) ? 'active' : ''}`} onClick={() => set({ date: addDays(today(), -1) })}>
                  Ontem
                </button>
              </div>
            )}
          </Field>

          <Field label="Estabelecimento" hint="Opcional — o sistema lembra a classificação">
            <Autocomplete
              id="qe-merchant"
              value={f.merchant ?? ''}
              placeholder="Ex.: iFood, Posto Shell"
              suggestions={merchantSuggestions}
              onChange={(merchant) => set({ merchant })}
              onPick={applyMerchant}
            />
          </Field>
          <Field label="Descrição" hint="Opcional — usa o estabelecimento ou a subcategoria">
            <input className="input" value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Almoço de domingo" aria-label="Descrição" />
          </Field>

          {combos.length > 0 && (
            <div className="full">
              <div className="label row" style={{ gap: 4, marginBottom: 6 }}>
                <Sparkles size={13} /> Usados recentemente
              </div>
              <div className="chips">
                {combos.map((c, i) => {
                  const cat = data.categories.find((x) => x.id === c.categoryId);
                  const sub = data.subcategories.find((x) => x.id === c.subcategoryId);
                  if (!cat) return null;
                  const active = f.categoryId === c.categoryId && f.subcategoryId === c.subcategoryId && (f.merchant ?? '') === (c.merchant ?? '');
                  return (
                    <button
                      type="button"
                      key={i}
                      className={`chip ${active ? 'active' : ''}`}
                      onClick={() => (c.merchant ? applyMerchant(c.merchant) : set({ categoryId: c.categoryId, subcategoryId: c.subcategoryId }))}
                    >
                      <span className="dot" style={{ background: cat.color }} />
                      {cat.name}
                      {sub ? ` › ${sub.name}` : ''}
                      {c.merchant ? ` · ${c.merchant}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <CategorySelects data={data} type={f.type} categoryId={f.categoryId} subcategoryId={f.subcategoryId} onChange={(categoryId, subcategoryId) => set({ categoryId, subcategoryId })} />

          <Field label="Forma de pagamento">
            <select className="input" value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })} aria-label="Forma de pagamento">
              {METHODS.filter((m) => !(m === 'credito' && f.type === 'receita')).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          {isCredit ? (
            <Field label="Cartão" error={errors.find((e) => e.includes('cartão'))}>
              {data.cards.length === 0 ? (
                <div className="hint">Cadastre um cartão no menu Cartões.</div>
              ) : (
                <select className="input" value={f.cardId ?? ''} onChange={(e) => set({ cardId: e.target.value })} aria-label="Cartão">
                  <option value="">Selecione</option>
                  {data.cards
                    .filter((c) => !c.archived || c.id === f.cardId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              )}
            </Field>
          ) : (
            <Field label={f.type === 'receita' ? 'Conta de entrada' : 'Conta de saída'}>
              <select className="input" value={f.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })} aria-label="Conta">
                <option value="">Não informar</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isCredit && !editing && (
            <Field label="Parcelas" hint={installmentPreview} className="full">
              <select className="input" value={f.installments ?? 1} onChange={(e) => set({ installments: Number(e.target.value) })} aria-label="Parcelas">
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'À vista' : `${n}x`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isCredit && editing && installmentPreview && <div className="hint full">{installmentPreview.split(' · ').pop()}</div>}
        </div>

        <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMore((m) => !m)}>
          {more ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Mais opções
        </button>
        {more && (
          <div className="form-grid">
            <Field label="Pessoa">
              <select className="input" value={f.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })} aria-label="Pessoa">
                <option value="">Família (não informar)</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Observação" className="full">
              <textarea className="input" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} aria-label="Observação" />
            </Field>
          </div>
        )}

        {errors.length > 0 && (
          <div className="alert critical" role="alert">
            {errors.join(' ')}
          </div>
        )}
        {editing && txStatus(editing) === 'parcial' && <div className="alert info">Este lançamento tem pagamento parcial. Use “Dar baixa” para registrar o restante.</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
