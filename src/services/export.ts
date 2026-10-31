import { formatDateBR, formatMonth } from '../domain/dates';
import { formatBRL } from '../domain/money';
import { statusLabel } from '../domain/transactions';
import type { Card, Category, Person, Subcategory, Transaction, Account } from '../domain/types';
import { PAYMENT_METHOD_LABELS } from '../domain/types';

export type Cell = string | number;

export interface Sheet {
  name: string;
  headers: string[];
  rows: Cell[][];
  /** Colunas monetárias (valor em reais, número) */
  moneyCols?: number[];
}

export interface Lookups {
  categories: Category[];
  subcategories: Subcategory[];
  cards: Card[];
  accounts: Account[];
  people: Person[];
}

/** Tabela de lançamentos pronta para exportar. Valores monetários em reais (número). */
export function transactionsSheet(txs: Transaction[], l: Lookups, name = 'Lançamentos'): Sheet {
  const cat = new Map(l.categories.map((c) => [c.id, c.name]));
  const sub = new Map(l.subcategories.map((s) => [s.id, s.name]));
  const card = new Map(l.cards.map((c) => [c.id, c.name]));
  const acc = new Map(l.accounts.map((a) => [a.id, a.name]));
  const ppl = new Map(l.people.map((p) => [p.id, p.name]));
  return {
    name,
    headers: ['Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Estabelecimento', 'Forma de pagamento', 'Conta/Cartão', 'Pessoa', 'Status', 'Valor (R$)', 'Observação'],
    moneyCols: [10],
    rows: [...txs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        formatDateBR(t.date),
        t.type === 'receita' ? 'Receita' : 'Despesa',
        t.description,
        t.categoryId ? (cat.get(t.categoryId) ?? '') : '',
        t.subcategoryId ? (sub.get(t.subcategoryId) ?? '') : '',
        t.merchant ?? '',
        PAYMENT_METHOD_LABELS[t.paymentMethod],
        t.cardId ? `${card.get(t.cardId) ?? ''}${t.invoiceMonth ? ` (fatura ${formatMonth(t.invoiceMonth)})` : ''}` : t.accountId ? (acc.get(t.accountId) ?? '') : '',
        t.personId ? (ppl.get(t.personId) ?? '') : '',
        statusLabel(t),
        (t.type === 'receita' ? 1 : -1) * (t.amount / 100),
        t.notes ?? '',
      ]),
  };
}

function csvEscape(v: Cell, money: boolean): string {
  let s = typeof v === 'number' ? (money ? v.toFixed(2).replace('.', ',') : String(v).replace('.', ',')) : v;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV no padrão do Excel brasileiro: separador ";", vírgula decimal e BOM UTF-8. */
export function toCSV(sheet: Sheet): string {
  const money = new Set(sheet.moneyCols ?? []);
  const lines = [sheet.headers.map((h) => csvEscape(h, false)).join(';')];
  for (const r of sheet.rows) lines.push(r.map((v, i) => csvEscape(v, money.has(i))).join(';'));
  return '﻿' + lines.join('\r\n');
}

export function download(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(filename: string, sheet: Sheet) {
  download(filename.endsWith('.csv') ? filename : `${filename}.csv`, toCSV(sheet), 'text/csv;charset=utf-8');
}

export async function exportXLSX(filename: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
    const money = new Set(s.moneyCols ?? []);
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let r = 1; r <= range.e.r; r++)
      for (const c of money) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      }
    ws['!cols'] = s.headers.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export async function exportPDF(filename: string, title: string, subtitle: string, sheets: Sheet[]) {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(subtitle, 40, 58);
  let y = 76;
  for (const s of sheets) {
    const money = new Set(s.moneyCols ?? []);
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(s.name, 40, y);
    autoTable.default(doc, {
      startY: y + 8,
      head: [s.headers],
      body: s.rows.map((r) => r.map((v, i) => (money.has(i) && typeof v === 'number' ? formatBRL(Math.round(v * 100)) : String(v)))),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 118, 110] },
      columnStyles: Object.fromEntries([...money].map((c) => [c, { halign: 'right' }])),
      margin: { left: 40, right: 40 },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 28;
    if (y > 520) {
      doc.addPage();
      y = 40;
    }
  }
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
