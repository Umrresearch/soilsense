import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, ReferenceLine,
} from 'recharts';
import {
  Droplets, Thermometer, CloudRain, Activity, Lightbulb, FileText, RefreshCw, TriangleAlert, WifiOff, ArrowRight,
  ArrowUpRight, ArrowDownRight, Wind, Sprout, Gauge,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi, useLiveStream } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { fmtNum, fmtLitres, timeAgo, moistureStatus, fmtDate } from '../lib/format.js';
import { Badge, EmptyState, ErrorState, PriorityBadge, Spinner, Alert } from '../components/ui.jsx';

const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm' };
const HEALTH_COLORS = { Good: '#147A3A', Dry: '#D97706', 'Critical — dry': '#B91C1C', Waterlogged: '#036594', 'No data': '#B9AE98' };
const axis = { stroke: 'var(--viz-axis)', tick: { fill: 'var(--viz-axis)', fontSize: 12 }, tickLine: false, axisLine: false };

/* ------------------------------------------------------------------ small building blocks */
function Panel({ title, sub, chip, action, children, className = '' }) {
  return (
    <section className={`dash-panel ${className}`}>
      <header className="dash-panel-head">
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="spacer" />
        {chip && <span className="dash-chip">{chip}</span>}
        {action}
      </header>
      {children}
    </section>
  );
}

function Delta({ value, unit = '%', goodWhen = 'up', label }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = goodWhen === 'neutral' ? null : (goodWhen === 'up') === up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`dash-delta ${good == null ? '' : good ? 'is-good' : 'is-bad'}`} title={label}>
      <Icon aria-hidden />{up ? '+' : ''}{fmtNum(value, 1)}{unit}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, unit, delta, foot, to }) {
  const nav = useNavigate();
  return (
    <article className={`dash-kpi ${to ? 'is-link' : ''}`} onClick={to ? () => nav(to) : undefined}>
      <div className="dash-kpi-top">
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-kpi-icon"><Icon aria-hidden /></span>
      </div>
      <div className="dash-kpi-value num">{value}{unit && <small>{unit}</small>}</div>
      <div className="dash-kpi-foot">{delta}<span>{foot}</span></div>
    </article>
  );
}

function ChartTip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{label}</div>
      {payload.map((p) => (
        <div className="tt-row" key={p.dataKey}><span className="tt-dot" style={{ background: p.color || p.payload?.fill }} />
          <b className="num">{fmt ? fmt(p.value) : fmtNum(p.value, 1)}</b></div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ widgets */
function Welcome({ farmer, s, critical, onPdf, pdfBusy }) {
  const thirsty = s.fields.filter((f) => f.soil_moisture != null && f.top_priority_rank >= 2).length;
  return (
    <section className="dash-welcome">
      <div className="dash-welcome-glow" aria-hidden />
      <span className="dash-welcome-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <h1>Namaste, {farmer.name.split(' ')[0]}!</h1>
      <p>
        {critical > 0 ? <><b>{critical} field{critical > 1 ? 's need' : ' needs'} attention now.</b> </>
          : thirsty > 0 ? <>{thirsty} field{thirsty > 1 ? 's have' : ' has'} advice waiting. </> : <>All fields are within their thresholds. </>}
        Last sensor update {timeAgo(s.sensors.last_update)}.
      </p>
      <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
        <Link to="/app/recommendations" className="btn btn-sm dash-welcome-btn">View advice <ArrowRight aria-hidden /></Link>
        <button className="btn btn-sm dash-welcome-ghost" onClick={onPdf} aria-busy={pdfBusy || undefined}><FileText aria-hidden /> Report</button>
      </div>
    </section>
  );
}

function FieldHealth({ fields, t }) {
  const data = useMemo(() => {
    const counts = {};
    for (const f of fields) { const k = moistureStatus(f.soil_moisture, t).label; counts[k] = (counts[k] ?? 0) + 1; }
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: HEALTH_COLORS[name] ?? '#B9AE98' }))
      .sort((a, b) => b.value - a.value);
  }, [fields, t]);
  return (
    <Panel title="Field health" sub="Soil moisture vs your thresholds">
      <div className="dash-donut">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={data.length > 1 ? 3 : 0}
              cornerRadius={6} stroke="var(--surface-1)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<ChartTip fmt={(v) => `${v} field${v > 1 ? 's' : ''}`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-donut-center"><b className="num">{fields.length}</b><span>fields</span></div>
      </div>
      <ul className="dash-legend">
        {data.map((d) => (
          <li key={d.name}><i style={{ background: d.fill }} />{d.name}<b className="num">{d.value}</b></li>
        ))}
      </ul>
    </Panel>
  );
}

function SensorGauge({ sensors }) {
  const pct = sensors.total ? Math.round((100 * sensors.online) / sensors.total) : 0;
  const data = [{ v: sensors.online, fill: 'var(--emerald-700)' }, { v: Math.max(0, sensors.total - sensors.online), fill: '#E4DAC5' }];
  return (
    <Panel title="Sensor uptime" sub="Reporting in the last 6 hours">
      <div className="dash-gauge">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="v" startAngle={180} endAngle={0} cx="50%" cy="100%" innerRadius="150%" outerRadius="195%"
              stroke="none" cornerRadius={8} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-gauge-center"><b className="num">{pct}%</b><span>{sensors.online} of {sensors.total} online</span></div>
      </div>
      <div className="dash-gauge-legend">
        <span><i style={{ background: 'var(--emerald-700)' }} />Online <b className="num">{sensors.online}</b></span>
        <span><i style={{ background: '#C9BDA4' }} />Needs check <b className="num">{sensors.stale + sensors.no_data}</b></span>
      </div>
    </Panel>
  );
}

function WaterByField({ rows }) {
  const data = useMemo(() => rows.map((f) => ({ name: f.field_name, kL: Math.round(f.water_litres / 100) / 10 })), [rows]);
  const max = Math.max(...data.map((d) => d.kL), 0);
  const total = data.reduce((a, d) => a + d.kL, 0);
  return (
    <Panel title="Water used by field" sub={<><b className="num" style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>{fmtNum(total, 0)} kL</b> in the last 7 days</>} chip="7 days">
      {total === 0 ? <EmptyState icon={Droplets} title="No irrigation logged this week" /> : (
        <div className="dash-chart" style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(n) => (n.length > 10 ? `${n.slice(0, 9)}…` : n)} />
              <YAxis {...axis} width={40} tickFormatter={(v) => (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : fmtNum(v, 0))} />
              <Tooltip content={<ChartTip fmt={(v) => `${fmtNum(v, 1)} kL`} />} cursor={{ fill: 'rgba(19,42,32,0.04)' }} />
              <Bar dataKey="kL" radius={[8, 8, 8, 8]} maxBarSize={44} isAnimationActive={false}
                label={{ position: 'top', fontSize: 11, fill: 'var(--text-secondary)', formatter: (v) => (v === max ? fmtNum(v, 0) : '') }}>
                {data.map((d) => <Cell key={d.name} fill={d.kL === max ? 'var(--emerald-700)' : '#DCD2BE'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function MoistureTrend({ daily, t, current, prev }) {
  const data = useMemo(() => daily.filter((d) => d.sensor_type === 'SOIL_MOISTURE')
    .map((d) => ({ day: new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), avg: d.avg })), [daily]);
  return (
    <Panel title="Soil moisture trend" chip="Daily average"
      sub={<><b className="num" style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>{fmtNum(current)}%</b> now{' '}
        <Delta value={current != null && prev != null ? current - prev : null} unit=" pts" goodWhen="neutral" label="vs 24 h ago" /> vs yesterday</>}>
      {data.length === 0 ? <EmptyState title="No readings yet" /> : (
        <div className="dash-chart" style={{ height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="moistFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2A78D6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2A78D6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="day" {...axis} minTickGap={24} />
              <YAxis {...axis} width={40} domain={[0, 'auto']} />
              {t && <ReferenceLine y={t.moisture_low} stroke="#A3500A" strokeDasharray="5 4"
                label={{ value: `Irrigate below ${t.moisture_low}%`, position: 'insideBottomRight', fill: 'var(--text-muted)', fontSize: 11 }} />}
              <Tooltip content={<ChartTip fmt={(v) => `${fmtNum(v, 1)}% moisture`} />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="avg" stroke="#2A78D6" strokeWidth={2.5} fill="url(#moistFill)" isAnimationActive={false}
                dot={false} activeDot={{ r: 6, fill: '#2A78D6', stroke: 'var(--surface-1)', strokeWidth: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function FieldsTable({ fields, t }) {
  const nav = useNavigate();
  return (
    <Panel title="Your fields" sub="Moisture against the target level" action={<Link to="/app/sensors" className="btn btn-ghost btn-sm">All sensors <ArrowRight aria-hidden /></Link>}>
      {fields.length === 0 ? <EmptyState title="No fields yet" action={<Link className="btn btn-primary" to="/app/settings?tab=fields">Add a field</Link>} /> : (
        <ul className="dash-fields">
          {fields.map((f) => {
            const ms = moistureStatus(f.soil_moisture, t);
            const target = t?.moisture_target ?? 32;
            const pct = f.soil_moisture == null ? 0 : Math.min(100, (100 * f.soil_moisture) / target);
            const bar = { success: 'var(--emerald-700)', warning: '#D97706', danger: '#B91C1C', info: '#036594' }[ms.tone] ?? '#C9BDA4';
            return (
              <li key={f.field_id} onClick={() => nav(`/app/sensors?field=${f.field_id}`)} tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && nav(`/app/sensors?field=${f.field_id}`)}>
                <span className="dash-field-avatar"><Sprout aria-hidden /></span>
                <div className="dash-field-main">
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <b className="dash-field-name">{f.field_name}</b>
                    <span className="muted dash-field-meta">{fmtNum(f.area_acres, 1)} ac · {f.irrigation_method}</span>
                  </div>
                  <div className="dash-progress" role="img" aria-label={`Moisture ${fmtNum(f.soil_moisture)}% of ${target}% target`}>
                    <span style={{ width: `${pct}%`, background: bar }} />
                  </div>
                </div>
                <div className="dash-field-val">
                  <b className="num">{f.soil_moisture == null ? '—' : `${fmtNum(f.soil_moisture)}%`}</b>
                  <span className="muted num">/ {target}%</span>
                </div>
                <div className="dash-field-badges">
                  {ms.tone === 'neutral' ? <Badge>No data</Badge> : <Badge tone={ms.tone}>{ms.label}</Badge>}
                  {f.sensors_unhealthy > 0 && <Badge tone="warning" icon={WifiOff}>{f.sensors_unhealthy}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Alerts({ alerts }) {
  const items = alerts.data?.alerts ?? [];
  const issues = (alerts.data?.sensorIssues ?? [])
    .filter((x) => !items.some((a) => a.field_id === x.field_id && a.rule_code === `SENSOR_${x.sensor_type}`));
  return (
    <Panel title="Alerts" sub="Urgent advice and sensor problems" action={<Link to="/app/recommendations" className="btn btn-ghost btn-sm">All <ArrowRight aria-hidden /></Link>}>
      {alerts.loading && !alerts.data ? <div className="skeleton" style={{ height: 140 }} /> : items.length + issues.length === 0 ? (
        <EmptyState icon={Sprout} title="All clear">No urgent alerts right now.</EmptyState>
      ) : (
        <ul className="dash-alerts">
          {items.slice(0, 5).map((a) => (
            <li key={a.rec_id}>
              <PriorityBadge priority={a.priority} />
              <div><div className="dash-alert-text">{a.action}</div><div className="muted dash-alert-meta">{a.field_name} · {timeAgo(a.timestamp)}</div></div>
            </li>
          ))}
          {issues.slice(0, 3).map((x) => (
            <li key={x.sensor_id}>
              <Badge tone="warning" icon={TriangleAlert}>Sensor</Badge>
              <div><div className="dash-alert-text">{x.sensor_id} is {x.health.toLowerCase().replace('_', ' ')}</div>
                <div className="muted dash-alert-meta">{x.field_name} · last reading {timeAgo(x.last_reading_at)}</div></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Weather({ fieldId }) {
  const w = useApi(fieldId ? `/api/weather/${fieldId}` : null);
  if (!fieldId) return null;
  return (
    <Panel title="Weather" sub="Forecast for your first field">
      {w.loading ? <div className="skeleton" style={{ height: 110 }} /> : w.error ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}><WifiOff size={16} style={{ display: 'inline', verticalAlign: -3 }} aria-hidden /> Weather unavailable right now.</p>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="dash-kpi-value num">{fmtNum(w.data.current?.temperature_2m, 0)}<small>°C</small></span>
            <span className="secondary">{WMO[w.data.current?.weather_code] ?? '—'}</span>
          </div>
          <div className="row muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
            <span><CloudRain size={14} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> {fmtNum(w.data.current?.relative_humidity_2m, 0)}%</span>
            <span><Wind size={14} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> {fmtNum(w.data.current?.wind_speed_10m, 0)} km/h</span>
          </div>
          <div className="weather-days">
            {w.data.daily?.time?.map((d, i) => (
              <div className="weather-day" key={d}>
                {i === 0 ? 'Today' : new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}
                <b>{fmtNum(w.data.daily.temperature_2m_max[i], 0)}° / {fmtNum(w.data.daily.temperature_2m_min[i], 0)}°</b>
                <span>{fmtNum(w.data.daily.precipitation_sum[i], 0)} mm</span>
              </div>
            ))}
          </div>
          {w.data.advice && <div style={{ marginTop: 'var(--sp-3)' }}><Alert tone="info">{w.data.advice}</Alert></div>}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */
export default function Dashboard() {
  const { farmer } = useAuth();
  const toast = useToast();
  const summary = useApi(`/api/dashboard/${farmer.farmer_id}/summary`, { pollMs: 60000 });
  const alerts = useApi(`/api/dashboard/${farmer.farmer_id}/alerts`, { pollMs: 60000 });
  const analytics = useApi(`/api/dashboard/${farmer.farmer_id}/analytics?period=week`, { pollMs: 300000 });
  const thr = useApi('/api/thresholds');
  const [pdfBusy, setPdfBusy] = useState(false);

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
  const critical = alerts.data?.alerts?.filter((a) => a.priority === 'CRITICAL').length ?? 0;
  const urgent = s.pending.byPriority.CRITICAL + s.pending.byPriority.HIGH;
  const waterDelta = s.water.litres_prev_7d > 0 ? (100 * (s.water.litres_7d - s.water.litres_prev_7d)) / s.water.litres_prev_7d : null;
  const moistDelta = s.sensors.avg_soil_moisture != null && s.trend?.soil_moisture_24h_ago != null
    ? s.sensors.avg_soil_moisture - s.trend.soil_moisture_24h_ago : null;

  const exportPdf = async () => {
    setPdfBusy(true);
    try { await download('/api/export/report.pdf', 'farm-report.pdf'); } catch (e) { toast.error(e); } finally { setPdfBusy(false); }
  };

  return (
    <div className="dash">
      <div className="dash-main">
        <div className="dash-row dash-row-top">
          <Welcome farmer={farmer} s={s} critical={critical} onPdf={exportPdf} pdfBusy={pdfBusy} />
          <Kpi icon={Droplets} label="Avg soil moisture" value={fmtNum(s.sensors.avg_soil_moisture)} unit="%"
            delta={<Delta value={moistDelta} unit=" pts" goodWhen="neutral" label="vs 24 h ago" />} foot="vs yesterday" to="/app/sensors" />
          <Kpi icon={Gauge} label="Water · 7 days" value={fmtLitres(s.water.litres_7d)}
            delta={<Delta value={waterDelta} goodWhen="down" label="vs previous 7 days" />} foot={`${s.water.sessions_7d} sessions`} to="/app/analytics" />
          <Kpi icon={Lightbulb} label="Pending advice" value={s.pending.total}
            delta={urgent > 0 ? <span className="dash-delta is-bad"><TriangleAlert aria-hidden />{urgent} urgent</span> : <span className="dash-delta is-good">0 urgent</span>}
            foot={`${s.trend?.applied_7d ?? 0} done this week`} to="/app/recommendations" />
        </div>

        <div className="dash-row dash-row-charts">
          <WaterByField rows={analytics.data?.fields ?? []} />
          {analytics.data ? <MoistureTrend daily={analytics.data.daily} t={t} current={s.sensors.avg_soil_moisture} prev={s.trend?.soil_moisture_24h_ago} />
            : <section className="dash-panel"><div className="skeleton" style={{ height: 260 }} /></section>}
        </div>

        <div className="dash-row dash-row-bottom">
          <FieldsTable fields={s.fields} t={t} />
          <Alerts alerts={alerts} />
        </div>
      </div>

      <aside className="dash-rail">
        <FieldHealth fields={s.fields} t={t} />
        <SensorGauge sensors={s.sensors} />
        <Weather fieldId={s.fields[0]?.field_id} />
        <Panel title="Right now" sub="Farm averages from online sensors">
          <ul className="dash-mini">
            <li><span className="dash-mini-icon" style={{ color: '#1F62B3' }}><Droplets aria-hidden /></span>Soil moisture<b className="num">{fmtNum(s.sensors.avg_soil_moisture)}%</b></li>
            <li><span className="dash-mini-icon" style={{ color: '#C2410C' }}><Thermometer aria-hidden /></span>Temperature<b className="num">{fmtNum(s.sensors.avg_temperature)}°C</b></li>
            <li><span className="dash-mini-icon" style={{ color: '#147A3A' }}><CloudRain aria-hidden /></span>Humidity<b className="num">{fmtNum(s.sensors.avg_humidity)}%</b></li>
            <li><span className="dash-mini-icon"><Activity aria-hidden /></span>Fertilizer · 30 d<b className="num">{fmtNum(s.fertilizer.kg_30d, 0)} kg</b></li>
          </ul>
        </Panel>
        <div className="row muted" style={{ fontSize: 'var(--fs-xs)', justifyContent: 'center' }}>
          Updated {fmtDate(s.generated_at)} ·
          <button className="btn btn-ghost btn-sm" style={{ minHeight: 28 }} onClick={() => { summary.reload(); alerts.reload(); analytics.reload(); }}>
            <RefreshCw aria-hidden /> Refresh
          </button>
        </div>
      </aside>
    </div>
  );
}

