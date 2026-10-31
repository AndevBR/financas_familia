import { toCSV, transactionsSheet } from '../export';
import { tx } from '../../test/helpers';

describe('exportação', () => {
  it('gera CSV compatível com Excel brasileiro', () => {
    const sheet = transactionsSheet(
      [tx({ description: 'Mercado; "grande"', amount: 123456, merchant: 'Carrefour', categoryId: 'c' }), tx({ type: 'receita', amount: 500000, date: '2026-10-01' })],
      { categories: [{ id: 'c', name: 'Alimentação', type: 'despesa', color: '', essential: true, order: 0 }], subcategories: [], cards: [], accounts: [], people: [] },
    );
    const csv = toCSV(sheet);
    expect(csv.startsWith('﻿Data;Tipo;')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('01/10/2026;Receita');
    expect(lines[1]).toContain(';5000,00;');
    expect(lines[2]).toContain('"Mercado; ""grande"""');
    expect(lines[2]).toContain(';Alimentação;');
    expect(lines[2]).toContain(';-1234,56;');
  });
});
