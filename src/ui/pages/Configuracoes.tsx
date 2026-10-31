import { Download, Moon, Pencil, Plus, Sun, Trash2, Upload, Monitor } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatBRL } from '../../domain/money';
import type { Person, Settings } from '../../domain/types';
import { exportBackup, restoreBackup, wipeAll } from '../../services/backup';
import { download } from '../../services/export';
import { deletePerson, ensureSeed, savePerson, syncRecurrences } from '../../services/finance';
import { useApp } from '../AppContext';
import { Segmented } from '../components/ui';
import type { FinanceData } from '../hooks/useFinance';
import { setThemePref } from '../hooks/useTheme';

export function Configuracoes({ data }: { data: FinanceData }) {
  const { confirm, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newPerson, setNewPerson] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);

  const doBackup = async () => {
    const b = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    download(`backup-financas-${stamp}.json`, JSON.stringify(b, null, 1), 'application/json');
    toast('Backup gerado');
  };

  const doRestore = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const ok = await confirm({
        title: 'Restaurar backup',
        danger: true,
        message: (
          <>
            Todos os dados atuais serão <b>substituídos</b> pelos dados do arquivo <b>{file.name}</b>. Recomendamos fazer um backup antes. Continuar?
          </>
        ),
        confirmLabel: 'Restaurar',
      });
      if (!ok) return;
      const counts = await restoreBackup(json);
      await syncRecurrences();
      toast(`Backup restaurado: ${counts.transactions} lançamentos`);
    } catch (e) {
      toast((e as Error).message || 'Arquivo inválido', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doWipe = async () => {
    const ok = await confirm({
      title: 'Apagar todos os dados',
      danger: true,
      message: 'Isto apaga TODOS os lançamentos, contas, cartões e configurações deste navegador. As categorias padrão serão recriadas. Não é possível desfazer.',
      confirmLabel: 'Apagar tudo',
    });
    if (!ok) return;
    const again = await confirm({ title: 'Tem certeza?', danger: true, message: 'Última confirmação: apagar todos os dados?', confirmLabel: 'Sim, apagar' });
    if (!again) return;
    await wipeAll();
    await ensureSeed();
    toast('Dados apagados');
  };

  const theme = data.settings?.theme ?? 'sistema';

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="card">
        <div className="card-head">
          <h2>Aparência</h2>
        </div>
        <Segmented<Settings['theme']>
          value={theme}
          onChange={(t) => setThemePref(t)}
          options={[
            { value: 'claro', label: <span className="row" style={{ gap: 6 }}><Sun size={14} /> Claro</span> },
            { value: 'escuro', label: <span className="row" style={{ gap: 6 }}><Moon size={14} /> Escuro</span> },
            { value: 'sistema', label: <span className="row" style={{ gap: 6 }}><Monitor size={14} /> Sistema</span> },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Pessoas da família</h2>
            <p>Usadas como titular de cartões e no filtro “Pessoa” dos relatórios.</p>
          </div>
        </div>
        <div className="list">
          {data.people.map((p) => (
            <div className="list-row" key={p.id}>
              {editing?.id === p.id ? (
                <input
                  className="input"
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      await savePerson(editing);
                      setEditing(null);
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={async () => {
                    if (editing.name.trim()) await savePerson(editing);
                    setEditing(null);
                  }}
                />
              ) : (
                <span style={{ flex: 1 }}>{p.name}</span>
              )}
              <button className="btn ghost sm icon" aria-label={`Renomear ${p.name}`} onClick={() => setEditing(p)}>
                <Pencil size={14} />
              </button>
              <button
                className="btn ghost sm icon danger"
                aria-label={`Excluir ${p.name}`}
                onClick={async () => {
                  if (await confirm({ title: 'Excluir pessoa', danger: true, message: `Excluir "${p.name}"? Os lançamentos e cartões ficam sem pessoa vinculada.`, confirmLabel: 'Excluir' })) {
                    await deletePerson(p.id);
                    toast('Pessoa excluída');
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="row mt" style={{ flexWrap: 'nowrap' }}>
          <input
            className="input"
            placeholder="Nome (ex.: Maria)"
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newPerson.trim()) {
                await savePerson({ name: newPerson });
                setNewPerson('');
              }
            }}
          />
          <button
            className="btn"
            onClick={async () => {
              if (!newPerson.trim()) return;
              await savePerson({ name: newPerson });
              setNewPerson('');
              toast('Pessoa adicionada');
            }}
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Backup e restauração</h2>
            <p>Seus dados ficam salvos neste navegador (IndexedDB). Faça backups regularmente para não perdê-los e para levá-los a outro dispositivo.</p>
          </div>
        </div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          {data.transactions.length} lançamentos · {data.categories.length} categorias · {data.accounts.length} contas · {data.cards.length} cartões · {data.recurrences.length} recorrências · total movimentado{' '}
          {formatBRL(data.transactions.reduce((a, t) => a + t.amount, 0))}
        </div>
        <div className="row">
          <button className="btn primary" onClick={doBackup}>
            <Download size={15} /> Baixar backup completo (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Restaurar backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doRestore(e.target.files[0])} />
        </div>
        <div className="alert info mt">
          Sincronização entre dispositivos: o banco usa identificadores únicos (UUID) em todos os registros, pronto para conectar a um serviço de sincronização (como Dexie Cloud ou Supabase) no futuro. Por enquanto, use o backup para transferir os dados.
        </div>
      </div>

      <div className="card" style={{ borderColor: 'var(--critical)' }}>
        <div className="card-head">
          <div>
            <h2 style={{ color: 'var(--critical)' }}>Zona de perigo</h2>
            <p>Apaga todos os dados deste navegador.</p>
          </div>
          <button className="btn danger" onClick={doWipe}>
            <Trash2 size={15} /> Apagar todos os dados
          </button>
        </div>
      </div>
    </div>
  );
}
