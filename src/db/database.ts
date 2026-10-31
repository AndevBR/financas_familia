import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  Card,
  Category,
  InvoicePayment,
  Merchant,
  Person,
  Recurrence,
  Settings,
  Subcategory,
  Transaction,
  Transfer,
} from '../domain/types';

/**
 * Banco local no navegador (IndexedDB). Os IDs são UUIDs gerados no cliente, o que
 * permite sincronizar no futuro (ex.: Dexie Cloud, Supabase) sem conflitos de chave.
 */
export class FinanceDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  subcategories!: Table<Subcategory, string>;
  merchants!: Table<Merchant, string>;
  people!: Table<Person, string>;
  accounts!: Table<Account, string>;
  cards!: Table<Card, string>;
  invoicePayments!: Table<InvoicePayment, string>;
  transfers!: Table<Transfer, string>;
  recurrences!: Table<Recurrence, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'financas-familia') {
    super(name);
    this.version(1).stores({
      transactions: 'id, date, type, categoryId, subcategoryId, cardId, invoiceMonth, accountId, recurrenceId, installment.groupId, createdAt',
      categories: 'id, type, order',
      subcategories: 'id, categoryId',
      merchants: 'id, name, lastUsedAt',
      people: 'id',
      accounts: 'id',
      cards: 'id',
      invoicePayments: 'id, cardId, invoiceMonth',
      transfers: 'id, date',
      recurrences: 'id, state',
      budgets: 'id, &categoryId',
      settings: 'id',
    });
  }
}

export const db = new FinanceDB();

export const TABLES = [
  'transactions',
  'categories',
  'subcategories',
  'merchants',
  'people',
  'accounts',
  'cards',
  'invoicePayments',
  'transfers',
  'recurrences',
  'budgets',
  'settings',
] as const;

export type TableName = (typeof TABLES)[number];

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
