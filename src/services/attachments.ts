import { db as defaultDb, newId, type FinanceDB } from '../db/database';
import type { Attachment, ID } from '../domain/types';

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_TYPES = 'image/*,application/pdf';

export interface AttachmentLink {
  transactionId?: ID;
  paymentId?: ID;
  invoicePaymentId?: ID;
}

export interface FileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function validateAttachment(file: Pick<FileLike, 'name' | 'type' | 'size'>): string | null {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isImage && !isPdf) return 'Envie uma foto (JPG, PNG...) ou um arquivo PDF.';
  if (file.size > MAX_ATTACHMENT_SIZE) return 'O arquivo é muito grande (máximo 10 MB).';
  if (file.size === 0) return 'O arquivo está vazio.';
  return null;
}

/**
 * Fotos de celular costumam ter vários MB. Reduz para no máximo 1600px em JPEG,
 * o suficiente para ler um comprovante. PDFs e imagens pequenas ficam como estão.
 */
export async function shrinkImage(file: FileLike): Promise<FileLike> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 400 * 1024) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(new Blob([await file.arrayBuffer()], { type: file.type }));
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { name, type: 'image/jpeg', size: blob.size, arrayBuffer: () => blob.arrayBuffer() };
  } catch {
    return file;
  }
}

export async function addAttachment(file: FileLike, link: AttachmentLink, db: FinanceDB = defaultDb): Promise<Attachment> {
  if (!link.transactionId && !link.invoicePaymentId) throw new Error('Comprovante sem vínculo.');
  const error = validateAttachment(file);
  if (error) throw new Error(error);
  const prepared = await shrinkImage(file);
  const att: Attachment = {
    id: newId(),
    ...link,
    name: prepared.name,
    type: prepared.type || 'application/pdf',
    size: prepared.size,
    data: await prepared.arrayBuffer(),
    createdAt: new Date().toISOString(),
  };
  await db.attachments.add(att);
  return att;
}

export async function deleteAttachment(id: ID, db: FinanceDB = defaultDb) {
  await db.attachments.delete(id);
}

export function attachmentsFor(list: Attachment[], link: AttachmentLink): Attachment[] {
  return list
    .filter((a) => (link.transactionId ? a.transactionId === link.transactionId : a.invoicePaymentId === link.invoicePaymentId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function attachmentUrl(a: Attachment): string {
  return URL.createObjectURL(new Blob([a.data], { type: a.type }));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Remove comprovantes cujo lançamento ou pagamento de fatura não existe mais. */
export async function pruneOrphanAttachments(db: FinanceDB = defaultDb): Promise<number> {
  return db.transaction('rw', [db.attachments, db.transactions, db.invoicePayments], async () => {
    const [txIds, payIds] = await Promise.all([db.transactions.toCollection().primaryKeys(), db.invoicePayments.toCollection().primaryKeys()]);
    const tx = new Set(txIds as string[]);
    const pay = new Set(payIds as string[]);
    return db.attachments.filter((a) => (a.transactionId ? !tx.has(a.transactionId) : !a.invoicePaymentId || !pay.has(a.invoicePaymentId))).delete();
  });
}
