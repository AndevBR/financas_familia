import { ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { addMonthKey, formatMonth } from '../../domain/dates';
import { centsToInput, formatBRL, parseBRL } from '../../domain/money';
import type { Cents, MonthKey } from '../../domain/types';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string; className?: string }) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Campo de valor em reais. Mantém o texto digitado e devolve centavos (ou null). */
export function MoneyInput({
  value,
  onChange,
  big,
  autoFocus,
  placeholder = '0,00',
  id,
  ariaLabel,
}: {
  value: Cents | null;
  onChange: (v: Cents | null) => void;
  big?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value != null && value !== 0 ? centsToInput(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value != null && value !== 0 ? centsToInput(value) : '');
      last.current = value;
    }
  }, [value]);
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={`input money ${big ? 'big' : ''}`}
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, '');
        setText(t);
        const v = parseBRL(t);
        last.current = v;
        onChange(v);
      }}
      onBlur={() => {
        if (last.current != null && last.current > 0) setText(centsToInput(last.current));
      }}
    />
  );
}

export function Money({ value, signed, className, type }: { value: Cents; signed?: boolean; className?: string; type?: 'receita' | 'despesa' }) {
  const cls = type === 'receita' ? 'income' : type === 'despesa' ? 'expense' : '';
  const text = signed && type ? `${type === 'receita' ? '+' : '−'} ${formatBRL(Math.abs(value))}` : formatBRL(value);
  return <span className={`money ${cls} ${className ?? ''}`}>{text}</span>;
}

export function Badge({ tone, children }: { tone?: 'good' | 'warning' | 'critical' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Progress({ value, tone, color, label }: { value: number; tone?: 'warning' | 'critical'; color?: string; label?: string }) {
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  highlight,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  highlight?: boolean;
  tone?: 'income' | 'expense';
}) {
  return (
    <div className={`card stat ${highlight ? 'highlight' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {icon && <div className="stat-icon" style={{ top: 16, right: 16 }}>{icon}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={36} />}
      <div className="strong" style={{ color: 'var(--text-2)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <div className="month-picker">
      <button className="btn ghost sm icon" onClick={() => onChange(addMonthKey(value, -1))} aria-label="Mês anterior">
        <ChevronLeft size={16} />
      </button>
      <span>{formatMonth(value)}</span>
      <button className="btn ghost sm icon" onClick={() => onChange(addMonthKey(value, 1))} aria-label="Próximo mês">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; className?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`${value === o.value ? 'active' : ''} ${o.className ?? ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de texto com sugestões (estabelecimentos). */
export function Autocomplete({
  value,
  onChange,
  onPick,
  suggestions,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (v: string) => void;
  suggestions: { value: string; hint?: string }[];
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const items = suggestions.filter((s) => s.value.toLowerCase() !== value.trim().toLowerCase() || value === '');
  return (
    <div className="autocomplete">
      <input
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && value.trim() && items[active]) {
            e.preventDefault();
            onPick(items[active].value);
            setOpen(false);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 && (
        <div className="ac-list" id={listId} role="listbox">
          {items.map((s, i) => (
            <div
              key={s.value}
              role="option"
              aria-selected={i === active}
              className={`ac-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.value);
                setOpen(false);
              }}
            >
              <span>{s.value}</span>
              {s.hint && <span className="muted tiny">{s.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="muted">sem comparação</span>;
  const up = value > 0;
  // para despesas, subir é ruim (vermelho); para receitas, invert = true
  const cls = (invert ? !up : up) ? 'up' : 'down';
  return (
    <span className={`delta ${Math.abs(value) < 0.5 ? '' : cls}`}>
      {up ? '▲' : value < 0 ? '▼' : '•'} {Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
    </span>
  );
}
