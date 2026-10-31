import type { Category, Subcategory, TxType } from './types';

interface SeedCategory {
  name: string;
  type: TxType;
  color: string;
  essential: boolean;
  subs: string[];
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Aplicativos', type: 'despesa', color: '#2a78d6', essential: false, subs: ['Alimentação', 'Farmácia', 'Mercado', 'Casa', 'Transporte', 'Outros'] },
  { name: 'Carro', type: 'despesa', color: '#eb6834', essential: true, subs: ['Combustível', 'Manutenção', 'Seguro', 'IPVA', 'Estacionamento', 'Lavagem'] },
  { name: 'Casa', type: 'despesa', color: '#1baf7a', essential: true, subs: ['Internet', 'Energia', 'Água', 'Gás', 'Limpeza', 'Manutenção'] },
  { name: 'Alimentação', type: 'despesa', color: '#eda100', essential: true, subs: ['Supermercado', 'Padaria', 'Açougue', 'Restaurante', 'Hortifruti'] },
  { name: 'Saúde', type: 'despesa', color: '#e87ba4', essential: true, subs: ['Farmácia', 'Consultas', 'Exames', 'Plano de saúde'] },
  { name: 'Família', type: 'despesa', color: '#008300', essential: true, subs: ['Escola', 'Roupas', 'Calçados', 'Crianças'] },
  { name: 'Lazer', type: 'despesa', color: '#6250d6', essential: false, subs: ['Passeios', 'Jogos', 'Streaming', 'Viagens'] },
  { name: 'Financeiro', type: 'despesa', color: '#e34948', essential: false, subs: ['Empréstimos', 'Juros', 'Tarifas', 'Seguros'] },
  { name: 'Pessoal', type: 'despesa', color: '#7a7a74', essential: false, subs: ['Vestuário', 'Cuidados pessoais', 'Compras diversas'] },
  { name: 'Receitas', type: 'receita', color: '#1baf7a', essential: true, subs: ['Salários', 'Renda extra', 'Reembolsos', 'Outras receitas'] },
];

/** Paleta categórica validada para daltonismo (ordem fixa). */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#7a7a74'];

/** Mesmas cores ajustadas para o fundo escuro. */
export const DARK_VARIANT: Record<string, string> = {
  '#2a78d6': '#3987e5',
  '#eb6834': '#d95926',
  '#1baf7a': '#199e70',
  '#eda100': '#c98500',
  '#e87ba4': '#d55181',
  '#008300': '#008300',
  '#6250d6': '#9085e9',
  '#e34948': '#e66767',
  '#7a7a74': '#8f8e87',
};

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
