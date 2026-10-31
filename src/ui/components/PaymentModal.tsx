import { useState } from 'react';
import { formatDateBR, today } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { openAmount, paidAmount } from '../../domain/transactions';
import type { Transaction } from '../../domain/types';
import { registerPayment } from '../../services/finance';
import { useApp } from '../AppContext';
import type { FinanceData } from '../hooks/useFinance';
import { Field, Modal, MoneyInput } from './ui';
import { AttachmentPicker } from './Attachments';
import { addAttachment } from '../../services/attachments';

/** Dar baixa total ou parcial em uma conta a pagar / receber. */
export function PaymentModal({ tx, data, onClose }: { tx: Transaction; data: FinanceData; onClose: () => void }) {
  const { toast } = useApp();
  const open = openAmount(tx);
  const [amount, setAmount] = useState<number | null>(open);
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(tx.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? '');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const isIncome = tx.type === 'receita';

  const save = async () => {
    try {
      if (!amount || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (amount > open) throw new Error(`O valor não pode ser maior que o saldo em aberto (${formatBRL(open)}).`);
      setSaving(true);
      const paymentId = await registerPayment(tx.id, amount, date, accountId || undefined);
      if (file) await addAttachment(file, { transactionId: tx.id, paymentId });
      toast(amount < open ? 'Pagamento parcial registrado' : isIncome ? 'Recebimento registrado' : 'Pagamento registrado');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isIncome ? 'Registrar recebimento' : 'Dar baixa / pagar'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            Confirmar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none', padding: 12 }}>
          <div className="strong">{tx.description}</div>
          <div className="small muted">
            Vencimento {formatDateBR(tx.date)} · Total {formatBRL(tx.amount)}
            {paidAmount(tx) > 0 && ` · Já ${isIncome ? 'recebido' : 'pago'} ${formatBRL(paidAmount(tx))}`}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Valor" hint={`Em aberto: ${formatBRL(open)} — informe um valor menor para pagamento parcial`} className="full">
            <MoneyInput big autoFocus value={amount} onChange={setAmount} ariaLabel="Valor do pagamento" />
          </Field>
          <Field label={isIncome ? 'Data do recebimento' : 'Data do pagamento'}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Conta">
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
          <div className="full">
            <AttachmentPicker file={file} onChange={setFile} />
          </div>
        </div>
        {error && <div className="alert critical">{error}</div>}
      </div>
    </Modal>
  );
}
