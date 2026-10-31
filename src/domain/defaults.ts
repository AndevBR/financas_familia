import type { Category, Subcategory, TxType } from './types';

interface SeedCategory {
  name: string;
  type: TxType;
  color: string;
  essential: boolean;
  subs: string[];
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Aplicativos', type: 'despesa', color: '#f97316', essential: false, subs: ['Alimentação', 'Farmácia', 'Mercado', 'Casa', 'Transporte', 'Outros'] },
  { name: 'Carro', type: 'despesa', color: '#3b82f6', essential: true, subs: ['Combustível', 'Manutenção', 'Seguro', 'IPVA', 'Estacionamento', 'Lavagem'] },
  { name: 'Casa', type: 'despesa', color: '#14b8a6', essential: true, subs: ['Internet', 'Energia', 'Água', 'Gás', 'Limpeza', 'Manutenção'] },
  { name: 'Alimentação', type: 'despesa', color: '#22c55e', essential: true, subs: ['Supermercado', 'Padaria', 'Açougue', 'Restaurante', 'Hortifruti'] },
  { name: 'Saúde', type: 'despesa', color: '#ef4444', essential: true, subs: ['Farmácia', 'Consultas', 'Exames', 'Plano de saúde'] },
  { name: 'Família', type: 'despesa', color: '#a855f7', essential: true, subs: ['Escola', 'Roupas', 'Calçados', 'Crianças'] },
  { name: 'Lazer', type: 'despesa', color: '#ec4899', essential: false, subs: ['Passeios', 'Jogos', 'Streaming', 'Viagens'] },
  { name: 'Financeiro', type: 'despesa', color: '#64748b', essential: false, subs: ['Empréstimos', 'Juros', 'Tarifas', 'Seguros'] },
  { name: 'Pessoal', type: 'despesa', color: '#eab308', essential: false, subs: ['Vestuário', 'Cuidados pessoais', 'Compras diversas'] },
  { name: 'Receitas', type: 'receita', color: '#10b981', essential: true, subs: ['Salários', 'Renda extra', 'Reembolsos', 'Outras receitas'] },
];

export const PALETTE = ['#0f766e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#22c55e', '#eab308', '#ec4899', '#14b8a6', '#64748b', '#8b5cf6', '#06b6d4'];

export function seedCategories(newId: () => string): { categories: Category[]; subcategories: Subcategory[] } {
  const categories: Category[] = [];
  const subcategories: Subcategory[] = [];
  DEFAULT_CATEGORIES.forEach((c, i) => {
    const id = newId();
    categories.push({ id, name: c.name, type: c.type, color: c.color, essential: c.essential, order: i });
    c.subs.forEach((s) => subcategories.push({ id: newId(), categoryId: id, name: s }));
  });
  return { categories, subcategories };
}
