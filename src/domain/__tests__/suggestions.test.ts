import { recentCombos, rememberMerchant, searchMerchants } from '../suggestions';
import { newId, tx } from '../../test/helpers';
import type { Merchant } from '../types';

describe('sugestões inteligentes', () => {
  const merchants: Merchant[] = [
    { id: 'm1', name: 'iFood', lastCategoryId: 'app', lastSubcategoryId: 'ali', usageCount: 10, lastUsedAt: '2026-10-01' },
    { id: 'm2', name: 'Drogasil', usageCount: 2, lastUsedAt: '2026-10-02' },
    { id: 'm3', name: 'Padaria Pão Dourado', usageCount: 5, lastUsedAt: '2026-10-03' },
  ];

  it('lembra a última classificação do estabelecimento', () => {
    const m = rememberMerchant(merchants, { merchant: 'IFOOD', categoryId: 'app', subcategoryId: 'far', paymentMethod: 'credito', cardId: 'c1' }, newId, 'now');
    expect(m).toMatchObject({ id: 'm1', name: 'iFood', lastSubcategoryId: 'far', lastPaymentMethod: 'credito', lastCardId: 'c1', usageCount: 11 });
    const novo = rememberMerchant(merchants, { merchant: 'Posto Shell', categoryId: 'carro', paymentMethod: 'pix' }, newId, 'now');
    expect(novo).toMatchObject({ name: 'Posto Shell', usageCount: 1 });
    expect(rememberMerchant(merchants, { merchant: '  ', paymentMethod: 'pix' }, newId)).toBeUndefined();
  });

  it('busca estabelecimentos ignorando acentos', () => {
    expect(searchMerchants(merchants, 'pao').map((m) => m.id)).toEqual(['m3']);
    expect(searchMerchants(merchants, '')[0].id).toBe('m1');
  });

  it('sugere as últimas combinações usadas', () => {
    const list = [
      tx({ categoryId: 'a', subcategoryId: 's1', createdAt: '1' }),
      tx({ categoryId: 'a', subcategoryId: 's1', createdAt: '2' }),
      tx({ categoryId: 'b', createdAt: '3' }),
      tx({ type: 'receita', categoryId: 'r', createdAt: '4' }),
    ];
    const combos = recentCombos(list, 'despesa');
    expect(combos.map((c) => c.categoryId)).toEqual(['b', 'a']);
  });
});
