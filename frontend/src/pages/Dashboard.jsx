import { useNavigate, Link } from 'react-router-dom';
import { Droplets, Thermometer, CloudRain, Activity, Lightbulb, Map, RefreshCw, FileText, TriangleAlert, WifiOff, ArrowRight, Wind } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi, useLiveStream } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { fmtNum, fmtLitres, timeAgo, moistureStatus, PRIORITY } from '../lib/format.js';
import { Badge, Button, Card, EmptyState, ErrorState, PriorityBadge, Spinner, StatCard, Alert } from '../components/ui.jsx';
import { useState } from 'react';

const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm' };

function Weather({ fieldId }) {
  const w = useApi(fieldId ? `/api/weather/${fieldId}` : null);
  if (!fieldId) return null;
  return (
    <Card title="Weather" sub="Open-Meteo forecast for your first field">
      {w.loading ? <div className="skeleton" style={{ height: 120 }} /> : w.error ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}><WifiOff size={16} style={{ display: 'inline', verticalAlign: -3 }} aria-hidden /> Weather unavailable right now.</p>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="stat-value">{fmtNum(w.data.current?.temperature_2m, 0)}<small>°C</small></span>
            <span className="secondary">{WMO[w.data.current?.weather_code] ?? '—'}</span>
          </div>
          <div className="row muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
            <span><CloudRain size={14} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> {fmtNum(w.data.current?.relative_humidity_2m, 0)}% humidity</span>
            <span><Wind size={14} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> {fmtNum(w.data.current?.wind_speed_10m, 0)} km/h</span>
          </div>
          <div className="weather-days">
            {w.data.daily?.time?.map((d, i) => (
              <div className="weather-day" key={d}>
                {i === 0 ? 'Today' : new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}
                <b>{fmtNum(w.data.daily.temperature_2m_max[i], 0)}° / {fmtNum(w.data.daily.temperature_2m_min[i], 0)}°</b>
                <span>{fmtNum(w.data.daily.precipitation_sum[i], 0)} mm rain</span>
              </div>
            ))}
          </div>
          {w.data.advice && <div style={{ marginTop: 'var(--sp-3)' }}><Alert tone="info">{w.data.advice}</Alert></div>}
        </>
      )}
    </Card>
  );
}

function Metric({ icon: Icon, label, value, unit, tone, at }) {
  return (
    <div className="metric" title={at ? `Updated ${timeAgo(at)}` : 'No reading'}>
      <span className="metric-label"><Icon aria-hidden />{label}</span>
      {value == null ? <span className="metric-value na">No data</span>
        : <span className="metric-value" style={tone ? { color: `var(--${tone})` } : undefined}>{fmtNum(value, 1)}<small className="muted" style={{ fontSize: 12 }}>{unit}</small></span>}
    </div>
  );
}

function FieldCard({ f, t }) {
  const nav = useNavigate();
  const ms = moistureStatus(f.soil_moisture, t);
  const topPriority = Object.entries(PRIORITY).find(([, p]) => p.rank === f.top_priority_rank)?.[0];
  return (
    <article className="card card-interactive" onClick={() => nav(`/app/sensors?field=${f.field_id}`)}
      onKeyDown={(e) => e.key === 'Enter' && nav(`/app/sensors?field=${f.field_id}`)} tabIndex={0} role="link" aria-label={`${f.field_name} details`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3>{f.field_name}</h3>
          <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{f.field_id} · {fmtNum(f.area_acres, 2)} ac · {f.soil_type} · {f.irrigation_method}</div>
        </div>
        <div className="spacer" />
        <Badge tone={ms.tone === 'neutral' ? undefined : ms.tone}>{ms.label}</Badge>
      </div>
      <div className="field-card-metrics">
        <Metric icon={Droplets} label="Moisture" value={f.soil_moisture} unit="%" tone={ms.tone === 'success' ? undefined : ms.tone === 'neutral' ? undefined : ms.tone} at={f.soil_moisture_at} />
        <Metric icon={Thermometer} label="Temp" value={f.temperature} unit="°C" tone={t && f.temperature >= t.temp_high ? 'warning' : undefined} at={f.temperature_at} />
        <Metric icon={CloudRain} label="Humidity" value={f.humidity} unit="%" at={f.humidity_at} />
      </div>
      <div className="row" style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)' }}>
        {f.pending_recommendations > 0
          ? <><PriorityBadge priority={topPriority} /><span className="secondary">{f.pending_recommendations} recommendation{f.pending_recommendations > 1 ? 's' : ''}</span></>
          : <span className="muted">No action needed</span>}
        <div className="spacer" />
        {f.sensors_unhealthy > 0 && <Badge tone="warning" icon={WifiOff}>{f.sensors_unhealthy} offline</Badge>}
      </div>
    </article>
  );
}

export default function Dashboard() {
  const { farmer } = useAuth();
  const toast = useToast();
  const summary = useApi(`/api/dashboard/${farmer.farmer_id}/summary`, { pollMs: 60000 });
  const alerts = useApi(`/api/dashboard/${farmer.farmer_id}/alerts`, { pollMs: 60000 });
  const thr = useApi('/api/thresholds');
  const [pdfBusy, setPdfBusy] = useState(false);

  // live: patch the field's latest value in place; refresh counts when recommendations change
  useLiveStream((type, d) => {
    if (type === 'reading' && d.status === 'GOOD') {
      const key = { SOIL_MOISTURE: 'soil_moisture', TEMPERATURE: 'temperature', HUMIDITY: 'humidity' }[d.sensor_type];
      summary.setData((s) => s && ({ ...s, fields: s.fields.map((f) => (f.field_id === d.field_id ? { ...f, [key]: d.value, [`${key}_at`]: d.timestamp } : f)) }));
    }
    if (type === 'recommendations') { summary.reload(true); alerts.reload(true); }
  });

  if (summary.loading && !summary.data) return <Spinner label="Loading your farm…" />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  const s = summary.data;
  const t = thr.data?.thresholds;
  const critical = alerts.data?.alerts?.filter((a) => a.priority === 'CRITICAL') ?? [];

  const exportPdf = async () => {
    setPdfBusy(true);
    try { await download('/api/export/report.pdf', 'farm-report.pdf'); } catch (e) { toast.error(e); } finally { setPdfBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>Namaste, {farmer.name.split(' ')[0]}</h1>
          <p>{farmer.farm_location} · last sensor update {timeAgo(s.sensors.last_update)}</p>
        </div>
        <div className="spacer" />
        <Button size="sm" icon={RefreshCw} onClick={() => { summary.reload(); alerts.reload(); }}>Refresh</Button>
        <Button size="sm" icon={FileText} loading={pdfBusy} onClick={exportPdf}>PDF report</Button>
      </div>

      {critical.length > 0 && (
        <Alert tone="danger" title={`${critical.length} field${critical.length > 1 ? 's need' : ' needs'} attention now`}>
          {critical.map((a) => `${a.field_name}: ${a.action}`).join(' · ')} <Link to="/app/recommendations">View advice →</Link>
        </Alert>
      )}

      <div className="grid grid-4">
        <StatCard icon={Map} label="Fields" value={s.totals.fields} foot={`${fmtNum(s.totals.total_area_acres, 1)} acres total`} />
        <StatCard icon={Activity} label="Sensors online" value={s.sensors.online} unit={`/ ${s.sensors.total}`}
          foot={s.sensors.stale + s.sensors.no_data > 0 ? `${s.sensors.stale + s.sensors.no_data} need checking` : 'All reporting'}
          tone={s.sensors.stale + s.sensors.no_data > 0 ? 'warning' : undefined} />
        <StatCard icon={Lightbulb} label="Pending advice" value={s.pending.total}
          foot={`${s.pending.byPriority.CRITICAL + s.pending.byPriority.HIGH} urgent · ${s.pending.byType.IRRIGATION} irrigation · ${s.pending.byType.FERTILIZER} fertilizer`} />
        <StatCard icon={Droplets} label="Water · 7 days" value={fmtLitres(s.water.litres_7d)} foot={`${s.water.sessions_7d} irrigation sessions`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', alignItems: 'start' }} data-dash-grid>
        <section className="stack">
          <div className="row"><h2>Your fields</h2><span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>sorted by urgency</span></div>
          {s.fields.length === 0 ? (
            <Card><EmptyState title="No fields yet" action={<Link className="btn btn-primary" to="/app/settings?tab=fields">Add a field</Link>}>Add a field to start receiving sensor data and advice.</EmptyState></Card>
          ) : (
            <div className="grid grid-2">{s.fields.map((f) => <FieldCard key={f.field_id} f={f} t={t} />)}</div>
          )}
        </section>
        <aside className="stack">
          <Card title="Alerts" sub="Urgent advice and sensor problems" actions={<Link to="/app/recommendations" className="btn btn-ghost btn-sm">All <ArrowRight aria-hidden /></Link>}>
            {alerts.loading && !alerts.data ? <div className="skeleton" style={{ height: 120 }} /> : (alerts.data?.count ?? 0) === 0 ? (
              <EmptyState title="All clear">No urgent alerts.</EmptyState>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 'var(--sp-3)' }}>
                {alerts.data.alerts.slice(0, 6).map((a) => (
                  <li key={a.rec_id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <PriorityBadge priority={a.priority} />
                    <div style={{ fontSize: 'var(--fs-sm)', minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{a.action}</div>
                      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{a.field_name} · {timeAgo(a.timestamp)}</div>
                    </div>
                  </li>
                ))}
                {alerts.data.sensorIssues
                  // skip sensors already covered by a SENSOR_* alert above
                  .filter((x) => !alerts.data.alerts.some((a) => a.field_id === x.field_id && a.rule_code === `SENSOR_${x.sensor_type}`))
                  .slice(0, 4).map((x) => (
                  <li key={x.sensor_id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <Badge tone="warning" icon={TriangleAlert}>Sensor</Badge>
                    <div style={{ fontSize: 'var(--fs-sm)' }}>
                      <div style={{ fontWeight: 500 }}>{x.sensor_id} ({x.sensor_type.replace('_', ' ').toLowerCase()}) is {x.health.toLowerCase().replace('_', ' ')}</div>
                      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{x.field_name} · last reading {timeAgo(x.last_reading_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Weather fieldId={s.fields[0]?.field_id} />
          <Card title="Farm averages" sub="Latest readings from online sensors">
            <dl className="kv">
              <dt>Soil moisture</dt><dd className="num">{fmtNum(s.sensors.avg_soil_moisture)} %</dd>
              <dt>Temperature</dt><dd className="num">{fmtNum(s.sensors.avg_temperature)} °C</dd>
              <dt>Humidity</dt><dd className="num">{fmtNum(s.sensors.avg_humidity)} %</dd>
              <dt>Fertilizer · 30 d</dt><dd className="num">{fmtNum(s.fertilizer.kg_30d, 0)} kg ({s.fertilizer.applications_30d} application{s.fertilizer.applications_30d === 1 ? '' : 's'})</dd>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
