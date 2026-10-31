import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../db/database';
import type { DataSet } from '../../domain/reports';
import type { Attachment, Merchant, Person, Recurrence, Settings } from '../../domain/types';

export interface FinanceData extends DataSet {
  people: Person[];
  merchants: Merchant[];
  recurrences: Recurrence[];
  attachments: Attachment[];
  settings?: Settings;
  loaded: boolean;
}

const EMPTY: FinanceData = {
  transactions: [],
  categories: [],
  subcategories: [],
  accounts: [],
  cards: [],
  invoicePayments: [],
  transfers: [],
  budgets: [],
  people: [],
  merchants: [],
  recurrences: [],
  attachments: [],
  loaded: false,
};

/** Carrega todos os dados e reage automaticamente a qualquer alteração no banco. */
export function useFinance(): FinanceData {
  const data = useLiveQuery(async () => {
    const [transactions, categories, subcategories, accounts, cards, invoicePayments, transfers, budgets, people, merchants, recurrences, settings, attachments] =
      await Promise.all([
        db.transactions.toArray(),
        db.categories.orderBy('order').toArray(),
        db.subcategories.toArray(),
        db.accounts.toArray(),
        db.cards.toArray(),
        db.invoicePayments.toArray(),
        db.transfers.toArray(),
        db.budgets.toArray(),
        db.people.toArray(),
        db.merchants.toArray(),
        db.recurrences.toArray(),
        db.settings.get('app'),
        db.attachments.toArray(),
      ]);
    subcategories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return { transactions, categories, subcategories, accounts, cards, invoicePayments, transfers, budgets, people, merchants, recurrences, settings, attachments, loaded: true };
  }, []);
  return data ?? EMPTY;
}

/** Mapas de consulta rápida por id. */
export function useLookups(d: FinanceData) {
  return useMemo(
    () => ({
      category: new Map(d.categories.map((c) => [c.id, c])),
      subcategory: new Map(d.subcategories.map((s) => [s.id, s])),
      account: new Map(d.accounts.map((a) => [a.id, a])),
      card: new Map(d.cards.map((c) => [c.id, c])),
      person: new Map(d.people.map((p) => [p.id, p])),
    }),
    [d.categories, d.subcategories, d.accounts, d.cards, d.people],
  );
}

export type Lookups = ReturnType<typeof useLookups>;
