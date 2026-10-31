import type { ID, Merchant, PaymentMethod, Transaction, TxType } from './types';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function findMerchant(merchants: Merchant[], name: string): Merchant | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return merchants.find((m) => norm(m.name) === n);
}

/** Estabelecimentos que combinam com o texto digitado, mais usados primeiro. */
export function searchMerchants(merchants: Merchant[], text: string, limit = 8): Merchant[] {
  const n = norm(text);
  return merchants
    .filter((m) => !n || norm(m.name).includes(n))
    .sort((a, b) => {
      const ap = norm(a.name).startsWith(n) ? 1 : 0;
      const bp = norm(b.name).startsWith(n) ? 1 : 0;
      return bp - ap || b.usageCount - a.usageCount || b.lastUsedAt.localeCompare(a.lastUsedAt);
    })
    .slice(0, limit);
}

/** Atualiza (ou cria) a "memória" do estabelecimento com a última classificação usada. */
export function rememberMerchant(
  merchants: Merchant[],
  tx: Pick<Transaction, 'merchant' | 'categoryId' | 'subcategoryId' | 'paymentMethod' | 'accountId' | 'cardId'>,
  newId: () => ID,
  now = new Date().toISOString(),
): Merchant | undefined {
  const name = tx.merchant?.trim();
  if (!name) return undefined;
  const existing = findMerchant(merchants, name);
  return {
    id: existing?.id ?? newId(),
    name: existing?.name ?? name,
    lastCategoryId: tx.categoryId ?? existing?.lastCategoryId,
    lastSubcategoryId: tx.categoryId ? tx.subcategoryId : existing?.lastSubcategoryId,
    lastPaymentMethod: tx.paymentMethod,
    lastAccountId: tx.accountId ?? existing?.lastAccountId,
    lastCardId: tx.cardId ?? existing?.lastCardId,
    usageCount: (existing?.usageCount ?? 0) + 1,
    lastUsedAt: now,
  };
}

export interface RecentCombo {
  categoryId: ID;
  subcategoryId?: ID;
  merchant?: string;
  paymentMethod: PaymentMethod;
}

/** Últimas combinações categoria/subcategoria usadas (sem repetição), para atalhos. */
export function recentCombos(txs: Transaction[], type: TxType, limit = 6): RecentCombo[] {
  const seen = new Set<string>();
  const out: RecentCombo[] = [];
  const sorted = txs
    .filter((t) => t.type === type && t.categoryId && !t.recurrenceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const t of sorted) {
    const key = `${t.categoryId}|${t.subcategoryId ?? ''}|${norm(t.merchant ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ categoryId: t.categoryId!, subcategoryId: t.subcategoryId, merchant: t.merchant, paymentMethod: t.paymentMethod });
    if (out.length >= limit) break;
  }
  return out;
}
