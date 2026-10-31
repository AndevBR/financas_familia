import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { PALETTE } from '../../domain/defaults';
import type { Category, TxType } from '../../domain/types';
import { deleteCategory, deleteSubcategory, saveCategory, saveSubcategory } from '../../services/finance';
import { useApp } from '../AppContext';
import { Field, Modal, Segmented } from '../components/ui';
import type { FinanceData } from '../hooks/useFinance';
import { useSeriesColor } from '../hooks/useTheme';

function CategoryForm({ category, type, onClose }: { category?: Category; type: TxType; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState(category ?? { name: '', type, color: PALETTE[0], essential: type === 'receita' });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await saveCategory(f);
      toast(category ? 'Categoria atualizada' : 'Categoria criada');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={category ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Nome">
          <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label="Tipo">
          <Segmented
            value={f.type}
            onChange={(t) => setF({ ...f, type: t })}
            options={[
              { value: 'despesa', label: 'Despesa' },
              { value: 'receita', label: 'Receita' },
            ]}
          />
        </Field>
        <Field label="Cor">
          <div className="chips">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setF({ ...f, color: c })} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: f.color === c ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
        </Field>
        {f.type === 'despesa' && (
          <label className="check">
            <input type="checkbox" checked={f.essential} onChange={(e) => setF({ ...f, essential: e.target.checked })} />
            Gasto essencial (não aparece como sugestão de corte, a menos que cresça)
          </label>
        )}
        {error && <div className="alert critical">{error}</div>}
      </div>
    </Modal>
  );
}

export function Categorias({ data }: { data: FinanceData }) {
  const { confirm, toast } = useApp();
  const color = useSeriesColor();
  const [type, setType] = useState<TxType>('despesa');
  const [form, setForm] = useState<{ category?: Category } | null>(null);
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [editingSub, setEditingSub] = useState<{ id: string; name: string } | null>(null);
  const cats = data.categories.filter((c) => c.type === type);
  const usage = (pred: (t: FinanceData['transactions'][number]) => boolean) => data.transactions.filter(pred).length;

  const removeCat = async (c: Category) => {
    const n = usage((t) => t.categoryId === c.id);
    const ok = await confirm({
      title: 'Excluir categoria',
      danger: true,
      message: (
        <>
          Excluir <b>{c.name}</b> e suas subcategorias?{' '}
          {n > 0 ? `${n} lançamento(s) ficarão "sem classificação" (não serão apagados).` : 'Nenhum lançamento usa esta categoria.'}
        </>
      ),
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    await deleteCategory(c.id);
    toast('Categoria excluída');
  };

  const addSub = async (categoryId: string) => {
    const name = newSub[categoryId]?.trim();
    if (!name) return;
    await saveSubcategory({ categoryId, name });
    setNewSub((s) => ({ ...s, [categoryId]: '' }));
    toast('Subcategoria adicionada');
  };

  return (
    <div className="stack">
      <div className="row between">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'despesa', label: 'Despesas' },
            { value: 'receita', label: 'Receitas' },
          ]}
        />
        <button className="btn primary" onClick={() => setForm({})}>
          <Plus size={16} /> Nova categoria
        </button>
      </div>
      <div className="grid grid-3">
        {cats.map((c) => {
          const subs = data.subcategories.filter((s) => s.categoryId === c.id);
          return (
            <div key={c.id} className="card">
              <div className="card-head" style={{ marginBottom: 8 }}>
                <h2 className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: color(c.color), width: 12, height: 12 }} /> {c.name}
                </h2>
                <span>
                  <button className="btn ghost sm icon" aria-label={`Editar ${c.name}`} onClick={() => setForm({ category: c })}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn ghost sm icon danger" aria-label={`Excluir ${c.name}`} onClick={() => removeCat(c)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <div className="tiny muted" style={{ marginBottom: 8 }}>
                {c.type === 'despesa' ? (c.essential ? 'Essencial' : 'Não essencial') : 'Receita'} · {usage((t) => t.categoryId === c.id)} lançamento(s)
              </div>
              <div className="list">
                {subs.map((s) => (
                  <div key={s.id} className="list-row small" style={{ padding: '5px 0' }}>
                    {editingSub?.id === s.id ? (
                      <>
                        <input
                          className="input"
                          style={{ minHeight: 30, padding: '4px 8px' }}
                          autoFocus
                          value={editingSub.name}
                          onChange={(e) => setEditingSub({ ...editingSub, name: e.target.value })}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              await saveSubcategory({ ...s, name: editingSub.name });
                              setEditingSub(null);
                            }
                            if (e.key === 'Escape') setEditingSub(null);
                          }}
                        />
                        <button
                          className="btn ghost sm icon"
                          aria-label="Salvar"
                          onClick={async () => {
                            await saveSubcategory({ ...s, name: editingSub.name });
                            setEditingSub(null);
                          }}
                        >
                          <Check size={14} />
                        </button>
                        <button className="btn ghost sm icon" aria-label="Cancelar" onClick={() => setEditingSub(null)}>
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1 }}>{s.name}</span>
                        <button className="btn ghost sm icon" aria-label={`Renomear ${s.name}`} onClick={() => setEditingSub({ id: s.id, name: s.name })}>
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn ghost sm icon danger"
                          aria-label={`Excluir ${s.name}`}
                          onClick={async () => {
                            const n = usage((t) => t.subcategoryId === s.id);
                            if (await confirm({ title: 'Excluir subcategoria', danger: true, message: `Excluir "${s.name}"?${n ? ` ${n} lançamento(s) ficarão só com a categoria.` : ''}`, confirmLabel: 'Excluir' })) {
                              await deleteSubcategory(s.id);
                              toast('Subcategoria excluída');
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                <input
                  className="input"
                  style={{ minHeight: 32, padding: '5px 8px' }}
                  placeholder="Nova subcategoria"
                  value={newSub[c.id] ?? ''}
                  onChange={(e) => setNewSub((s) => ({ ...s, [c.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addSub(c.id)}
                />
                <button className="btn sm icon" aria-label="Adicionar subcategoria" onClick={() => addSub(c.id)}>
                  <Plus size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {form && <CategoryForm category={form.category} type={type} onClose={() => setForm(null)} />}
    </div>
  );
}
