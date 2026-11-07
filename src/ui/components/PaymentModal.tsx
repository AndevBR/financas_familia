import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { invoiceChoices, invoiceMonthFor } from '../../domain/cards';
import { formatDateBR, formatMonth, today } from '../../domain/dates';
import { formatBRL, splitAmount } from '../../domain/money';
import { openAmount, paidAmount } from '../../domain/transactions';
import type { Transaction } from '../../domain/types';
import { payTransactionWithCard, registerPayment } from '../../services/finance';
import { useApp } from '../AppContext';
import type { FinanceData } from '../hooks/useFinance';
import { Field, Modal, MoneyInput } from './ui';
import { AttachmentPicker } from './Attachments';
import { addAttachment } from '../../services/attachments';

/**
 * Dar baixa total ou parcial em uma conta a pagar / receber.
 * Despesas também podem ser pagas com cartão de crédito: o valor em aberto vai para a fatura.
 */
export function PaymentModal({ tx, data, onClose }: { tx: Transaction; data: FinanceData; onClose: () => void }) {
  const { toast } = useApp();
  const open = openAmount(tx);
  const isIncome = tx.type === 'receita';
  const accounts = data.accounts.filter((a) => !a.archived);
  const cards = isIncome ? [] : data.cards.filter((c) => !c.archived);
  const [amount, setAmount] = useState<number | null>(open);
  const [date, setDate] = useState(today());
  // "acc:<id>" para conta, "card:<id>" para cartão de crédito
  const [payWith, setPayWith] = useState(() => {
    const acc = tx.accountId ?? accounts[0]?.id;
    return acc ? `acc:${acc}` : '';
  });
  const [invoiceMonth, setInvoiceMonth] = useState<string | undefined>(undefined);
  const [installments, setInstallments] = useState(1);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const card = payWith.startsWith('card:') ? cards.find((c) => `card:${c.id}` === payWith) : undefined;
  const accountId = payWith.startsWith('acc:') ? payWith.slice(4) : undefined;

  const save = async () => {
    try {
      setSaving(true);
      if (card) {
        await payTransactionWithCard(tx.id, { cardId: card.id, date, invoiceMonth, installments });
        if (file) await addAttachment(file, { transactionId: tx.id });
        const month = invoiceMonth || invoiceMonthFor(date, card);
        toast(`Pago no ${card.name} · fatura de ${formatMonth(month)}`);
      } else {
        if (!amount || amount <= 0) throw new Error('Informe um valor maior que zero.');
        if (amount > open) throw new Error(`O valor não pode ser maior que o saldo em aberto (${formatBRL(open)}).`);
        const paymentId = await registerPayment(tx.id, amount, date, accountId);
        if (file) await addAttachment(file, { transactionId: tx.id, paymentId });
        toast(amount < open ? 'Pagamento parcial registrado' : isIncome ? 'Recebimento registrado' : 'Pagamento registrado');
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const autoInvoice = card ? invoiceChoices(card, date).find((c) => c.automatic)! : undefined;

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
            {card ? (
              <>
                <CreditCard size={15} /> Pagar no cartão
              </>
            ) : (
              'Confirmar'
            )}
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
          <Field label={isIncome ? 'Receber em' : 'Pagar com'} className="full">
            <select className="input" value={payWith} onChange={(e) => setPayWith(e.target.value)} aria-label={isIncome ? 'Receber em' : 'Pagar com'}>
              <option value="">Não informar</option>
              <optgroup label="Contas">
                {accounts.map((a) => (
                  <option key={a.id} value={`acc:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              {cards.length > 0 && (
                <optgroup label="Cartões de crédito">
                  {cards.map((c) => (
                    <option key={c.id} value={`card:${c.id}`}>
                      💳 {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>

          {card ? (
            <>
              <Field label="Valor no cartão" className="full" hint="O valor em aberto vai inteiro para a fatura. Para pagar só uma parte, primeiro dê baixa parcial pela conta.">
                <div className="input big money" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>
                  {formatBRL(open)}
                </div>
              </Field>
              <Field label="Data no cartão">
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data no cartão" />
              </Field>
              <Field label="Parcelas" hint={installments > 1 ? `${installments}x de ${formatBRL(splitAmount(open, installments)[1])}` : undefined}>
                <select className="input" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} aria-label="Parcelas">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'À vista' : `${n}x`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fatura" className="full">
                <select className="input" value={invoiceMonth ?? ''} onChange={(e) => setInvoiceMonth(e.target.value || undefined)} aria-label="Fatura">
                  <option value="">
                    Automática — {formatMonth(autoInvoice!.month)} (vence {formatDateBR(autoInvoice!.dueDate)})
                  </option>
                  {invoiceChoices(card, date, invoiceMonth).map((c) => (
                    <option key={c.month} value={c.month}>
                      Fatura de {formatMonth(c.month)} — vence {formatDateBR(c.dueDate)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="alert info full">
                A conta sai de “Contas a pagar” e entra na fatura do cartão, mantendo a categoria. Ela é contada uma vez só: o pagamento da fatura depois não gera despesa nova.
              </div>
            </>
          ) : (
            <>
              <Field label="Valor" hint={`Em aberto: ${formatBRL(open)} — informe um valor menor para pagamento parcial`} className="full">
                <MoneyInput big autoFocus value={amount} onChange={setAmount} ariaLabel="Valor do pagamento" />
              </Field>
              <Field label={isIncome ? 'Data do recebimento' : 'Data do pagamento'} className="full">
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </>
          )}
          <div className="full">
            <AttachmentPicker file={file} onChange={setFile} />
          </div>
        </div>
        {error && <div className="alert critical">{error}</div>}
      </div>
    </Modal>
  );
}
