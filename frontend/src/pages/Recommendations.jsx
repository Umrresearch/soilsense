import { useState } from 'react';
import { Droplets, FlaskConical, TriangleAlert, Check, X, RefreshCw, History, ChevronDown, Sprout, Timer } from 'lucide-react';
import { useApi, useLiveStream } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDateTime, fmtLitres, fmtMinutes, fmtNum, timeAgo } from '../lib/format.js';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PriorityBadge, Segmented, Spinner } from '../components/ui.jsx';

const TYPE = {
  IRRIGATION: { icon: Droplets, cls: 'irrigation', label: 'Irrigation' },
  FERTILIZER: { icon: FlaskConical, cls: 'fertilizer', label: 'Fertilizer' },
  ALERT: { icon: TriangleAlert, cls: 'alert', label: 'Alert' },
};
const STATUS_TONE = { APPLIED: 'success', DISMISSED: undefined, EXPIRED: undefined, PENDING: 'info' };

function RecCard({ r, onApply, onDismiss }) {
  const [open, setOpen] = useState(r.priority === 'CRITICAL' || r.priority === 'HIGH');
  const T = TYPE[r.type];
  const plan = r.details?.plan;
  return (
    <article className="card">
      <div className="rec">
        <div className={`rec-icon ${T.cls}`}><T.icon aria-hidden /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <PriorityBadge priority={r.priority} />
            <Badge icon={false}>{T.label}</Badge>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{r.field_name} · {timeAgo(r.timestamp)}</span>
          </div>
          <div className="rec-action">{r.action}</div>
          {plan && (
            <div className="row muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 6 }}>
              <span className="row" style={{ gap: 4 }}><Droplets size={14} aria-hidden /><span className="num">{fmtLitres(plan.water_litres)}</span></span>
              <span className="row" style={{ gap: 4 }}><Timer size={14} aria-hidden /><span className="num">{fmtMinutes(plan.duration_min)}</span></span>
              <span>Deficit <span className="num">{fmtNum(plan.deficit_pct)}%</span></span>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} /> Why this recommendation?
          </button>
          {open && <div className="rec-why">{r.explanation}{r.details?.confidence === 'reduced' && <div style={{ marginTop: 6 }}><Badge tone="warning">Reduced confidence — some readings missing</Badge></div>}</div>}
          <div className="rec-actions">
            {r.type !== 'ALERT'
              ? <Button variant="primary" icon={Check} onClick={() => onApply(r)}>Mark as done</Button>
              : <Button variant="primary" icon={Check} onClick={() => onApply(r)}>Acknowledge</Button>}
            <Button variant="ghost" icon={X} onClick={() => onDismiss(r)}>Dismiss</Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Recommendations() {
  const toast = useToast();
  const [type, setType] = useState('ALL');
  const qs = type === 'ALL' ? '' : `&type=${type}`;
  const current = useApi(`/api/recommendations?status=PENDING${qs}`, { pollMs: 60000 });
  const history = useApi(`/api/recommendations?status=ALL&limit=60${qs}`);
  const [applying, setApplying] = useState(null);
  const [form, setForm] = useState({});
  const [dismissing, setDismissing] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useLiveStream((t) => { if (t === 'recommendations') current.reload(true); });

  const refreshAll = async () => {
    setBusy(true);
    try {
      const r = await api('/api/recommendations/evaluate', { method: 'POST' });
      toast.success(`Re-checked ${r.evaluated} fields · ${r.created} new, ${r.expired} resolved`);
      current.reload(); history.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const openApply = (r) => {
    setApplying(r);
    setForm(r.type === 'IRRIGATION' ? { duration: r.details?.plan?.duration_min ?? '', waterAmount: r.details?.plan?.water_litres ?? '' }
      : r.type === 'FERTILIZER' ? { amount: r.details?.amount_kg ?? '' } : {});
  };
  const confirmApply = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
      if (body.duration) body.duration = Math.min(1440, Math.round(body.duration));
      const r = await api(`/api/recommendations/${applying.rec_id}/apply`, { method: 'POST', body });
      toast.success(r.logType ? `Done! Added to your ${r.logType} log.` : 'Acknowledged');
      setApplying(null); current.reload(); history.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const confirmDismiss = async () => {
    setBusy(true);
    try {
      await api(`/api/recommendations/${dismissing.rec_id}/dismiss`, { method: 'POST', body: reason ? { reason } : {} });
      toast.info('Recommendation dismissed');
      setDismissing(null); setReason(''); current.reload(); history.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const recs = current.data?.recommendations ?? [];
  const past = (history.data?.recommendations ?? []).filter((r) => r.status !== 'PENDING');

  return (
    <>
      <div className="filters">
        <div className="form-field">
          <span className="form-label">Show</span>
          <Segmented label="Recommendation type" value={type} onChange={setType} options={[
            { value: 'ALL', label: 'All' }, { value: 'IRRIGATION', label: 'Irrigation' }, { value: 'FERTILIZER', label: 'Fertilizer' }, { value: 'ALERT', label: 'Alerts' }]} />
        </div>
        <div className="spacer" />
        <Button icon={RefreshCw} loading={busy && !applying && !dismissing} onClick={refreshAll}>Re-check all fields</Button>
      </div>

      <section className="stack">
        <h2>Current ({recs.length})</h2>
        {current.loading && !current.data ? <Spinner /> : current.error ? <ErrorState error={current.error} onRetry={current.reload} />
          : recs.length === 0 ? <Card><EmptyState icon={Sprout} title="Nothing to do right now">Your fields are within their thresholds. We’ll alert you when something changes.</EmptyState></Card>
          : recs.map((r) => <RecCard key={r.rec_id} r={r} onApply={openApply} onDismiss={setDismissing} />)}
      </section>

      <Card title="History" sub="Applied, dismissed and expired recommendations" actions={<History size={18} className="muted" aria-hidden />}>
        {history.loading && !history.data ? <div className="skeleton" style={{ height: 160 }} /> : past.length === 0 ? <EmptyState title="No history yet" /> : (
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table className="table">
              <thead><tr><th>When</th><th>Field</th><th>Type</th><th>Advice</th><th>Outcome</th></tr></thead>
              <tbody>{past.map((r) => (
                <tr key={r.rec_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.timestamp)}</td>
                  <td>{r.field_name}</td>
                  <td>{TYPE[r.type].label}</td>
                  <td style={{ minWidth: 240 }}>{r.action}</td>
                  <td><Badge tone={STATUS_TONE[r.status]} icon={false}>{r.status.toLowerCase()}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(applying)} title={applying?.type === 'ALERT' ? 'Acknowledge alert' : 'Confirm what you did'} onClose={() => setApplying(null)}
        footer={<><Button variant="ghost" onClick={() => setApplying(null)}>Cancel</Button><Button variant="primary" icon={Check} loading={busy} onClick={confirmApply}>Save</Button></>}>
        <p className="secondary" style={{ marginBottom: 'var(--sp-4)' }}>{applying?.action}</p>
        {applying?.type === 'IRRIGATION' && (
          <div className="form-grid">
            <Input label="Pumping time (minutes)" type="number" inputMode="numeric" min={1} max={1440} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} hint="Change if you ran it for a different time" />
            <Input label="Water used (litres)" type="number" inputMode="numeric" min={1} value={form.waterAmount} onChange={(e) => setForm({ ...form, waterAmount: e.target.value })} />
          </div>
        )}
        {applying?.type === 'FERTILIZER' && (
          <Input label={`${applying.details?.product} applied (kg)`} type="number" inputMode="decimal" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        )}
        {applying?.type === 'ALERT' && <p className="muted">This marks the alert as handled. It will come back if the condition is still present at the next reading.</p>}
      </Modal>

      <Modal open={Boolean(dismissing)} title="Dismiss recommendation" onClose={() => setDismissing(null)}
        footer={<><Button variant="ghost" onClick={() => setDismissing(null)}>Cancel</Button><Button variant="danger" icon={X} loading={busy} onClick={confirmDismiss}>Dismiss</Button></>}>
        <p className="secondary" style={{ marginBottom: 'var(--sp-4)' }}>{dismissing?.action}</p>
        <Input label="Reason (optional)" placeholder="e.g. rain expected, canal water not available" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}
