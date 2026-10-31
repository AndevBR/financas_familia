import { FinanceDB } from '../../db/database';
import { addAttachment, attachmentsFor, pruneOrphanAttachments, validateAttachment } from '../attachments';
import { exportBackup, restoreBackup } from '../backup';
import { deleteCard, deleteInvoicePayment, deleteTransaction, ensureSeed, payInvoice, registerPayment, saveCard, saveQuickEntry } from '../finance';

let db: FinanceDB;
let n = 0;
beforeEach(async () => {
  db = new FinanceDB(`att-${++n}`);
  await ensureSeed(db);
});
afterEach(() => db.delete());

const file = (name: string, type: string, bytes = [1, 2, 3, 250]) => {
  const u = new Uint8Array(bytes);
  return { name, type, size: u.length, arrayBuffer: async () => u.buffer.slice(0) };
};

describe('comprovantes', () => {
  it('aceita apenas imagens e PDF', () => {
    expect(validateAttachment({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(validateAttachment({ name: 'foto.jpg', type: 'image/jpeg', size: 10 })).toBeNull();
    expect(validateAttachment({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).not.toBeNull();
    expect(validateAttachment({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toContain('grande');
  });

  it('anexa ao pagamento e remove junto com o lançamento', async () => {
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 33819, date: '2026-10-10', paymentMethod: 'boleto', paid: false }, db);
    const paymentId = await registerPayment(t.id, 33819, '2026-10-10', undefined, db);
    await addAttachment(file('comprovante.pdf', 'application/pdf'), { transactionId: t.id, paymentId }, db);
    await addAttachment(file('foto.png', 'image/png'), { transactionId: t.id }, db); // anexado depois
    const list = attachmentsFor(await db.attachments.toArray(), { transactionId: t.id });
    expect(list.map((a) => a.name)).toEqual(['comprovante.pdf', 'foto.png']);
    expect(list[0].paymentId).toBe(paymentId);
    expect(new Uint8Array(list[0].data)).toEqual(new Uint8Array([1, 2, 3, 250]));
    await deleteTransaction(t.id, {}, db);
    expect(await db.attachments.count()).toBe(0);
  });

  it('anexa ao pagamento de fatura e remove ao excluir o pagamento ou o cartão', async () => {
    await saveCard({ name: 'Visa', limit: 100000, closingDay: 5, dueDay: 12, color: '#000' }, db);
    const card = (await db.cards.toArray())[0];
    const p1 = await payInvoice({ cardId: card.id, invoiceMonth: '2026-10', amount: 100, date: '2026-10-12' }, db);
    const p2 = await payInvoice({ cardId: card.id, invoiceMonth: '2026-11', amount: 100, date: '2026-11-12' }, db);
    await addAttachment(file('fatura.pdf', 'application/pdf'), { invoicePaymentId: p1.id }, db);
    await addAttachment(file('fatura2.pdf', 'application/pdf'), { invoicePaymentId: p2.id }, db);
    await deleteInvoicePayment(p1.id, db);
    expect(await db.attachments.count()).toBe(1);
    await deleteCard(card.id, db);
    expect(await db.attachments.count()).toBe(0);
  });

  it('recusa comprovante sem vínculo e limpa órfãos', async () => {
    await expect(addAttachment(file('a.pdf', 'application/pdf'), {}, db)).rejects.toThrow();
    await db.attachments.add({ id: 'orfao', transactionId: 'nao-existe', name: 'x.pdf', type: 'application/pdf', size: 1, data: new ArrayBuffer(1), createdAt: '' });
    expect(await pruneOrphanAttachments(db)).toBe(1);
  });

  it('backup inclui os comprovantes e restaura o conteúdo', async () => {
    const [t] = await saveQuickEntry({ type: 'despesa', amount: 100, date: '2026-10-10', paymentMethod: 'pix', paid: true }, db);
    await addAttachment(file('pix.png', 'image/png', [137, 80, 78, 71, 0, 255]), { transactionId: t.id }, db);
    const json = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(typeof json.data.attachments[0].data).toBe('string');
    const other = new FinanceDB(`att-restore-${n}`);
    await restoreBackup(json, other);
    const [a] = await other.attachments.toArray();
    expect(new Uint8Array(a.data)).toEqual(new Uint8Array([137, 80, 78, 71, 0, 255]));
    await other.delete();
  });

  it('restaura backups antigos (sem comprovantes)', async () => {
    const json = JSON.parse(JSON.stringify(await exportBackup(db)));
    delete json.data.attachments;
    json.version = 1;
    await expect(restoreBackup(json, db)).resolves.toBeDefined();
  });
});
