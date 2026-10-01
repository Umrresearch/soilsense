import { Component, useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, Eye, EyeOff, Info, TriangleAlert, CircleCheck, X, Sprout, RefreshCw } from 'lucide-react';
import { PRIORITY } from '../lib/format.js';

export function Button({ variant = 'secondary', size, block, loading, icon: Icon, children, className = '', ...rest }) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} aria-busy={loading || undefined} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" style={{ width: 16, height: 16 }} aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Field({ label, required, hint, error, children, className = '' }) {
  const id = useId();
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': error || hint ? `${id}-d` : undefined }) : children;
  return (
    <div className={`form-field ${className}`}>
      {label && <label className="form-label" htmlFor={id}>{label}{required && <span className="req" aria-hidden>*</span>}</label>}
      {child}
      {error ? <span className="form-error" id={`${id}-d`}><CircleAlert size={13} aria-hidden />{error}</span>
        : hint ? <span className="form-hint" id={`${id}-d`}>{hint}</span> : null}
    </div>
  );
}

export function Input({ label, required, hint, error, className, ...rest }) {
  return <Field label={label} required={required} hint={hint} error={error} className={className}>{(a) => <input className="input" required={required} {...a} {...rest} />}</Field>;
}

export function PasswordInput({ label = 'Password', error, hint, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} required={rest.required} error={error} hint={hint}>
      {(a) => (
        <div className="input-wrap">
          <input className="input" type={show ? 'text' : 'password'} {...a} {...rest} />
          <button type="button" className="btn btn-ghost icon-btn input-adorn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff /> : <Eye />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function Select({ label, required, hint, error, options, className, ...rest }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={className}>
      {(a) => (
        <select className="select" required={required} {...a} {...rest}>
          {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      )}
    </Field>
  );
}

export function Card({ title, sub, actions, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || actions) && (
        <header className="card-header">
          <div style={{ minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, unit, foot, tone }) {
  return (
    <div className="card stat">
      <span className="stat-label">{Icon && <Icon aria-hidden />}{label}</span>
      <span className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}{unit && <small>{unit}</small>}</span>
      {foot && <span className="stat-foot">{foot}</span>}
    </div>
  );
}

const TONE_ICON = { success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info };
export function Badge({ tone, icon, children }) {
  const Icon = icon === false ? null : icon || TONE_ICON[tone];
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{Icon && <Icon aria-hidden />}{children}</span>;
}

export const PriorityBadge = ({ priority }) => {
  const p = PRIORITY[priority] ?? PRIORITY.LOW;
  return <Badge tone={p.tone}>{p.label}</Badge>;
};

export function Alert({ tone = 'info', title, children, onClose }) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div style={{ flex: 1 }}>
        {title && <div className="alert-title">{title}</div>}
        <div className="secondary">{children}</div>
      </div>
      {onClose && <button className="btn btn-ghost btn-sm icon-btn" style={{ minHeight: 28, minWidth: 28 }} onClick={onClose} aria-label="Close"><X /></button>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <div className="spacer" />
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close dialog"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = ({ label = 'Loading…', large }) => (
  <div className="center-pad" role="status"><span className={`spinner ${large ? 'spinner-lg' : ''}`} aria-hidden /><span>{label}</span></div>
);

export function EmptyState({ icon: Icon = Sprout, title, children, action }) {
  return <div className="empty"><Icon aria-hidden /><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <CircleAlert aria-hidden style={{ color: 'var(--danger)' }} />
      <h3>Couldn’t load this</h3>
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button icon={RefreshCw} onClick={() => onRetry()}>Try again</Button>}
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="center-pad" style={{ minHeight: '60vh' }}>
          <CircleAlert size={40} color="var(--danger)" aria-hidden />
          <h2>Something went wrong on this page</h2>
          <p className="muted">{this.state.error.message}</p>
          <Button variant="primary" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Reload</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
