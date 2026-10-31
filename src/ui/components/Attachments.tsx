import { Download, Eye, FileText, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment } from '../../domain/types';
import { ACCEPTED_TYPES, addAttachment, attachmentsFor, attachmentUrl, deleteAttachment, formatSize, validateAttachment, type AttachmentLink } from '../../services/attachments';
import { useApp } from '../AppContext';
import { Modal } from './ui';

/** Campo opcional de comprovante usado nos formulários de pagamento. */
export function AttachmentPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  return (
    <div className="field">
      <label>Comprovante (opcional)</label>
      {file ? (
        <div className="attach-chip">
          <Paperclip size={14} />
          <span className="ellipsis">{file.name}</span>
          <span className="muted tiny">{formatSize(file.size)}</span>
          <button type="button" className="btn ghost sm icon" aria-label="Remover comprovante" onClick={() => onChange(null)}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => ref.current?.click()}>
          <Paperclip size={15} /> Anexar foto ou PDF
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        aria-label="Arquivo do comprovante"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const err = validateAttachment(f);
          setError(err ?? '');
          if (!err) onChange(f);
        }}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

function Thumb({ a }: { a: Attachment }) {
  const url = useMemo(() => (a.type.startsWith('image/') ? attachmentUrl(a) : ''), [a]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url ? <img src={url} alt="" className="attach-thumb" /> : <div className="attach-thumb pdf"><FileText size={22} /></div>;
}

function openFile(a: Attachment, download = false) {
  const url = attachmentUrl(a);
  const link = document.createElement('a');
  link.href = url;
  if (download) link.download = a.name;
  else link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lista, visualiza, adiciona e exclui comprovantes de um lançamento ou pagamento de fatura. */
export function AttachmentsModal({ link, title, subtitle, attachments, onClose }: { link: AttachmentLink; title: string; subtitle?: string; attachments: Attachment[]; onClose: () => void }) {
  const { toast, confirm } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const previewUrl = useMemo(() => (preview ? attachmentUrl(preview) : ''), [preview]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const list = attachmentsFor(attachments, link);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await addAttachment(f, link);
      toast(files.length > 1 ? `${files.length} comprovantes anexados` : 'Comprovante anexado');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Comprovantes"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
          <button className="btn primary" disabled={busy} onClick={() => ref.current?.click()}>
            <Plus size={15} /> {busy ? 'Anexando…' : 'Anexar comprovante'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <div className="strong">{title}</div>
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
        {list.length === 0 ? (
          <button type="button" className="attach-drop" onClick={() => ref.current?.click()}>
            <Paperclip size={22} />
            <span>Nenhum comprovante ainda. Toque para anexar uma foto ou PDF.</span>
          </button>
        ) : (
          <div className="list">
            {list.map((a) => (
              <div key={a.id} className="list-row">
                <button type="button" className="attach-thumb-btn" onClick={() => (a.type.startsWith('image/') ? setPreview(a) : openFile(a))} aria-label={`Ver ${a.name}`}>
                  <Thumb a={a} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 550 }}>
                    {a.name}
                  </div>
                  <div className="tiny muted">
                    {formatSize(a.size)} · anexado em {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button className="btn ghost sm icon" aria-label={`Ver ${a.name}`} title="Ver" onClick={() => (a.type.startsWith('image/') ? setPreview(a) : openFile(a))}>
                  <Eye size={15} />
                </button>
                <button className="btn ghost sm icon" aria-label={`Baixar ${a.name}`} title="Baixar" onClick={() => openFile(a, true)}>
                  <Download size={15} />
                </button>
                <button
                  className="btn ghost sm icon danger"
                  aria-label={`Excluir ${a.name}`}
                  title="Excluir"
                  onClick={async () => {
                    if (await confirm({ title: 'Excluir comprovante', danger: true, message: `Excluir "${a.name}"?`, confirmLabel: 'Excluir' })) {
                      if (preview?.id === a.id) setPreview(null);
                      await deleteAttachment(a.id);
                      toast('Comprovante excluído');
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {preview && (
          <div className="attach-preview">
            <div className="row between small">
              <span className="ellipsis">{preview.name}</span>
              <button className="btn ghost sm icon" aria-label="Fechar visualização" onClick={() => setPreview(null)}>
                <X size={15} />
              </button>
            </div>
            <img src={previewUrl} alt={preview.name} />
          </div>
        )}
        <input ref={ref} type="file" accept={ACCEPTED_TYPES} multiple hidden aria-label="Arquivo do comprovante" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      </div>
    </Modal>
  );
}

/** Botão de clipe: destaca quando já existe comprovante. */
export function AttachmentButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      className={`btn ghost sm icon attach-btn ${count ? 'has' : ''}`}
      onClick={onClick}
      title={count ? `${count} comprovante(s)` : 'Anexar comprovante'}
      aria-label={count ? `Ver comprovantes (${count})` : 'Anexar comprovante'}
    >
      <Paperclip size={15} />
      {count > 0 && <span className="attach-count">{count}</span>}
    </button>
  );
}
