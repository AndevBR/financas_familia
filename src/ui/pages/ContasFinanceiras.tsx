import { ArrowRightLeft, Banknote, Landmark, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { accountBalance, accountMovements } from '../../domain/accounts';
import { formatDateBR, today } from '../../domain/dates';
import { PALETTE } from '../../domain/defaults';
import { formatBRL, sum } from '../../domain/money';
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType, type Transfer } from '../../domain/types';
import { deleteAccount, deleteTransfer, saveAccount, saveTransfer } from '../../services/finance';
import { useApp } from '../AppContext';
import { EmptyState, Field, Modal, MoneyInput, StatCard } from '../components/ui';
import type { FinanceData } from '../hooks/useFinance';

const ICONS: Record<AccountType, typeof Landmark> = { banco: Landmark, dinheiro: Banknote, carteira: Smartphone };

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Omit<Account, 'id'> & { id?: string }>(account ?? { name: '', type: 'banco', initialBalance: 0, color: PALETTE[0] });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await saveAccount(f);
      toast(account ? 'Conta atualizada' : 'Conta criada');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={account ? 'Editar conta' : 'Nova conta'}
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
        <Field label="Nome" className="full">
          <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Itaú, Carteira, PicPay" />
        </Field>
        <Field label="Tipo">
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AccountType })}>
            {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Saldo inicial (R$)" hint="Saldo antes do primeiro lançamento no sistema">
          <MoneyInput value={f.initialBalance} onChange={(v) => setF({ ...f, initialBalance: v ?? 0 })} />
        </Field>
        <Field label="Cor" className="full">
          <div className="chips">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setF({ ...f, color: c })} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: f.color === c ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
        </Field>
      </div>
      {error && <div className="alert critical mt">{error}</div>}
    </Modal>
  );
}

function TransferForm({ data, onClose }: { data: FinanceData; onClose: () => void }) {
  const { toast } = useApp();
  const active = data.accounts.filter((a) => !a.archived);
  const [f, setF] = useState<Omit<Transfer, 'id'>>({ fromAccountId: active[0]?.id ?? '', toAccountId: active[1]?.id ?? '', amount: 0, date: today(), notes: '' });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await saveTransfer(f);
      toast('Transferência registrada');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Transferência entre contas"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Transferir
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="De">
          <select className="input" value={f.fromAccountId} onChange={(e) => setF({ ...f, fromAccountId: e.target.value })}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Para">
          <select className="input" value={f.toAccountId} onChange={(e) => setF({ ...f, toAccountId: e.target.value })}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor (R$)">
          <MoneyInput autoFocus value={f.amount} onChange={(v) => setF({ ...f, amount: v ?? 0 })} />
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Observação" className="full">
          <input className="input" value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      <div className="hint mt">Transferências entre contas próprias não contam como receita nem despesa.</div>
      {error && <div className="alert critical mt">{error}</div>}
    </Modal>
  );
}

export function ContasFinanceiras({ data }: { data: FinanceData }) {
  const { confirm, toast } = useApp();
  const [form, setForm] = useState<{ account?: Account } | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const accounts = data.accounts.filter((a) => showArchived || !a.archived);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const selectedId = selected ?? accounts[0]?.id;
  const ref = today();
  const balances = useMemo(() => new Map(data.accounts.map((a) => [a.id, accountBalance(a, data, ref)])), [data, ref]);
  const total = sum(data.accounts.filter((a) => !a.archived).map((a) => balances.get(a.id) ?? 0));
  const names = Object.fromEntries(data.accounts.map((a) => [a.id, a.name]));
  const cardNames = Object.fromEntries(data.cards.map((c) => [c.id, c.name]));
  const selectedAcc = data.accounts.find((a) => a.id === selectedId);
  const movements = useMemo(
    () => (selectedId ? accountMovements(selectedId, { ...data, accountNames: names, cardNames }).reverse() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selectedId],
  );

  const remove = async (a: Account) => {
    const ok = await confirm({
      title: 'Excluir conta',
      danger: true,
      message: (
        <>
          Excluir a conta <b>{a.name}</b>? Se ela tiver movimentações, será apenas arquivada para preservar o histórico.
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const r = await deleteAccount(a.id);
    toast(r === 'arquivada' ? 'Conta arquivada (possui histórico)' : 'Conta excluída');
    setSelected(undefined);
  };

  return (
    <div className="stack">
      <div className="row between">
        <label className="check small">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivadas
        </label>
        <div className="row">
          <button className="btn" onClick={() => setTransfer(true)} disabled={data.accounts.filter((a) => !a.archived).length < 2}>
            <ArrowRightLeft size={15} /> Transferir
          </button>
          <button className="btn primary" onClick={() => setForm({})}>
            <Plus size={16} /> Nova conta
          </button>
        </div>
      </div>
      <div className="stats">
        <StatCard highlight label="Saldo total hoje" value={formatBRL(total)} sub={`${data.accounts.filter((a) => !a.archived).length} conta(s) ativa(s)`} />
        {accounts.map((a) => {
          const Icon = ICONS[a.type];
          return (
            <div key={a.id} className="card stat" style={{ cursor: 'pointer', outline: a.id === selectedId ? '2px solid var(--brand)' : undefined, opacity: a.archived ? 0.6 : 1 }} onClick={() => setSelected(a.id)}>
              <div className="stat-label">
                <Icon size={14} color={a.color} /> {a.name} {a.archived && <span className="badge">arquivada</span>}
              </div>
              <div className={`stat-value ${(balances.get(a.id) ?? 0) < 0 ? 'expense' : ''}`}>{formatBRL(balances.get(a.id) ?? 0)}</div>
              <div className="row between">
                <span className="stat-sub">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                <span>
                  <button className="btn ghost sm icon" aria-label="Editar conta" onClick={(e) => (e.stopPropagation(), setForm({ account: a }))}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn ghost sm icon danger" aria-label="Excluir conta" onClick={(e) => (e.stopPropagation(), remove(a))}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Extrato · {selectedAcc?.name ?? '—'}</h2>
              <p>Saldo inicial {formatBRL(selectedAcc?.initialBalance ?? 0)} · apenas valores efetivamente pagos/recebidos</p>
            </div>
          </div>
          {movements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação" />
          ) : (
            <div className="list">
              {movements.slice(0, 60).map((m, i) => (
                <div className="list-row small" key={i}>
                  <span className="muted num">{formatDateBR(m.date)}</span>
                  <span className="ellipsis" style={{ flex: 1 }}>
                    {m.description}
                    {m.date > ref && <span className="badge" style={{ marginLeft: 6 }}>agendado</span>}
                  </span>
                  <b className={`num ${m.amount >= 0 ? 'income' : 'expense'}`}>
                    {m.amount >= 0 ? '+' : '−'} {formatBRL(Math.abs(m.amount))}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Transferências</h2>
          </div>
          {data.transfers.length === 0 ? (
            <EmptyState icon={<ArrowRightLeft size={32} />} title="Nenhuma transferência" />
          ) : (
            <div className="list">
              {[...data.transfers]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((t) => (
                  <div className="list-row small" key={t.id}>
                    <span className="muted num">{formatDateBR(t.date)}</span>
                    <span className="ellipsis" style={{ flex: 1 }}>
                      {names[t.fromAccountId] ?? '?'} → {names[t.toAccountId] ?? '?'}
                      {t.notes && <span className="muted"> · {t.notes}</span>}
                    </span>
                    <b className="num">{formatBRL(t.amount)}</b>
                    <button
                      className="btn ghost sm icon danger"
                      aria-label="Excluir transferência"
                      onClick={async () => {
                        if (await confirm({ title: 'Excluir transferência', danger: true, message: `Excluir a transferência de ${formatBRL(t.amount)}?`, confirmLabel: 'Excluir' })) {
                          await deleteTransfer(t.id);
                          toast('Transferência excluída');
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
      {form && <AccountForm account={form.account} onClose={() => setForm(null)} />}
      {transfer && <TransferForm data={data} onClose={() => setTransfer(false)} />}
    </div>
  );
}
