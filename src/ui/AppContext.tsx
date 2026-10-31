import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Transaction } from '../domain/types';
import type { QuickEntryInput } from '../domain/transactions';
import { Modal } from './components/ui';
import type { AttachmentLink } from '../services/attachments';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Opções extras (ex.: excluir só esta parcela ou todas). Retorna o valor da escolhida. */
  choices?: { value: string; label: string; danger?: boolean }[];
}

interface AppApi {
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  confirm: (opts: ConfirmOptions) => Promise<string | false>;
  openEntry: (prefill?: Partial<QuickEntryInput>) => void;
  openEdit: (t: Transaction) => void;
  openPayment: (t: Transaction) => void;
  openAttachments: (target: AttachmentTarget) => void;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do provedor');
  return c;
}

export interface AttachmentTarget {
  link: AttachmentLink;
  title: string;
  subtitle?: string;
}

export interface ModalState {
  entry?: Partial<QuickEntryInput> | true;
  edit?: Transaction;
  payment?: Transaction;
  attachments?: AttachmentTarget;
}

export function AppProvider({ children, renderModals }: { children: ReactNode; renderModals: (s: ModalState, close: () => void) => ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: string | false) => void }) | null>(null);
  const [modals, setModals] = useState<ModalState>({});
  const seq = useRef(0);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2800);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<string | false>((resolve) => setConfirmState({ ...opts, resolve })), []);

  const api: AppApi = {
    toast,
    confirm,
    openEntry: (prefill) => setModals({ entry: prefill ?? true }),
    openEdit: (t) => setModals({ edit: t }),
    openPayment: (t) => setModals({ payment: t }),
    openAttachments: (target) => setModals({ attachments: target }),
  };

  const closeConfirm = (v: string | false) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {renderModals(modals, () => setModals({}))}
      {confirmState && (
        <Modal
          title={confirmState.title}
          onClose={() => closeConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => closeConfirm(false)}>
                Cancelar
              </button>
              {confirmState.choices ? (
                confirmState.choices.map((c) => (
                  <button key={c.value} className={`btn ${c.danger ? 'danger solid' : 'primary'}`} onClick={() => closeConfirm(c.value)}>
                    {c.label}
                  </button>
                ))
              ) : (
                <button autoFocus className={`btn ${confirmState.danger ? 'danger solid' : 'primary'}`} onClick={() => closeConfirm('ok')}>
                  {confirmState.confirmLabel ?? 'Confirmar'}
                </button>
              )}
            </>
          }
        >
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {confirmState.danger && <AlertTriangle size={20} color="var(--critical)" style={{ flexShrink: 0, marginTop: 2 }} />}
            <div>{confirmState.message}</div>
          </div>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
