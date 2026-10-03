import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Droplets, Thermometer, CloudRain, WifiOff, Wifi, CircleAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi, useLiveStream } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { fmtNum, fmtDateTime, timeAgo, SENSOR_META, moistureStatus } from '../lib/format.js';
import { Badge, Button, Card, EmptyState, ErrorState, Segmented, Select, Spinner } from '../components/ui.jsx';
import { ChartFrame, MetricChart, LegendRow } from '../components/charts.jsx';

const ICONS = { SOIL_MOISTURE: Droplets, TEMPERATURE: Thermometer, HUMIDITY: CloudRain };
const HEALTH = { ONLINE: ['success', 'Online', Wifi], STALE: ['warning', 'Stale', WifiOff], NO_DATA: ['danger', 'No data', CircleAlert], INACTIVE: [undefined, 'Inactive', WifiOff] };

function SensorChart({ sensor, period, t }) {
  const a = useApi(`/api/readings/${sensor.sensor_id}/analytics?period=${period}`, { pollMs: 120000 });
  const meta = SENSOR_META[sensor.sensor_type];
  const data = useMemo(() => (a.data?.series ?? []).map((b) => ({ t: b.bucket, value: b.good ? b.avg : null, min: b.min, max: b.max, missing: b.missing })), [a.data]);

  let band, lines = [], legend = [{ label: `${meta.label} (${period === 'day' ? 'hourly' : period === 'week' ? '6-hourly' : 'daily'} average)`, color: meta.hex }];
  if (t && sensor.sensor_type === 'SOIL_MOISTURE') {
    band = [t.moisture_low, t.moisture_high];
    lines = [{ y: t.moisture_low, label: `Irrigate below ${t.moisture_low}%`, color: '#FB923C' }, { y: t.moisture_critical, label: `Critical ${t.moisture_critical}%`, color: '#F87171' }];
    legend.push({ label: 'Thresholds', color: '#FB923C', dashed: true }, { label: 'Healthy range', color: 'rgba(74,222,128,.35)' });
  } else if (t && sensor.sensor_type === 'TEMPERATURE') {
    lines = [{ y: t.temp_high, label: `Heat stress ${t.temp_high}°C`, color: '#FB923C' }];
    legend.push({ label: 'Threshold', color: '#FB923C', dashed: true });
  } else if (t && sensor.sensor_type === 'HUMIDITY') {
    lines = [{ y: t.humidity_high, label: `Disease risk ${t.humidity_high}%`, color: '#FB923C' }];
    legend.push({ label: 'Threshold', color: '#FB923C', dashed: true });
  }
  const sum = a.data?.summary;
  return (
    <ChartFrame
      title={meta.label}
      sub={sum ? `avg ${fmtNum(sum.avg)}${meta.unit} · min ${fmtNum(sum.min)} · max ${fmtNum(sum.max)} · trend ${sum.trend} · ${fmtNum(sum.missing_pct)}% missing` : sensor.sensor_id}
      legend={<LegendRow items={legend} />}
      table={
        <table className="table">
          <thead><tr><th>Time</th><th className="num">Average</th><th className="num">Min</th><th className="num">Max</th><th className="num">Missing</th></tr></thead>
          <tbody>{[...data].reverse().map((d) => (
            <tr key={d.t}><td>{fmtDateTime(d.t)}</td><td className="num">{d.value == null ? '—' : fmtNum(d.value)}</td><td className="num">{fmtNum(d.min)}</td><td className="num">{fmtNum(d.max)}</td><td className="num">{d.missing}</td></tr>
          ))}</tbody>
        </table>
      }
    >
      {a.loading && !a.data ? <div className="skeleton chart-box" /> : a.error ? <ErrorState error={a.error} onRetry={a.reload} /> : data.length === 0
        ? <EmptyState icon={WifiOff} title="No readings in this period" />
        : <MetricChart data={data} name={meta.label} unit={meta.unit} color={meta.hex} period={period} band={band} lines={lines}
            domain={sensor.sensor_type === 'TEMPERATURE' ? ['auto', 'auto'] : [0, 'auto']} />}
    </ChartFrame>
  );
}

export default function Sensors() {
  const { farmer } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState('week');
  const fields = useApi(`/api/farmers/${farmer.farmer_id}/fields`, { pollMs: 60000 });
  const thr = useApi('/api/thresholds');
  const fieldId = params.get('field') || fields.data?.fields?.[0]?.field_id;
  const sensors = useApi(fieldId ? `/api/fields/${fieldId}/sensors` : null, { pollMs: 60000 });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => { if (!params.get('field') && fieldId) setParams({ field: fieldId }, { replace: true }); }, [fieldId, params, setParams]);

  useLiveStream((type, d) => {
    if (type !== 'reading') return;
    if (d.field_id === fieldId) {
      sensors.setData((s) => s && ({ ...s, sensors: s.sensors.map((x) => (x.sensor_id === d.sensor_id && d.status === 'GOOD'
        ? { ...x, last_reading: d.value, last_reading_at: d.timestamp, health: 'ONLINE' } : x)) }));
      setFlash(d.sensor_id);
      setTimeout(() => setFlash(null), 1200);
    }
    if (d.status === 'GOOD') {
      const key = { SOIL_MOISTURE: 'soil_moisture', TEMPERATURE: 'temperature', HUMIDITY: 'humidity' }[d.sensor_type];
      fields.setData((f) => f && ({ ...f, fields: f.fields.map((x) => (x.field_id === d.field_id ? { ...x, [key]: d.value } : x)) }));
    }
  });

  if (fields.loading && !fields.data) return <Spinner />;
  if (fields.error) return <ErrorState error={fields.error} onRetry={fields.reload} />;
  const list = fields.data.fields;
  if (!list.length) return <Card><EmptyState title="No fields yet">Add a field in Settings to see sensor data.</EmptyState></Card>;
  const t = thr.data?.thresholds;
  const current = list.find((f) => f.field_id === fieldId);

  const exportCsv = async (all) => {
    setBusy(true);
    try { await download(`/api/export/readings.csv${all ? '' : `?fieldId=${fieldId}`}`, 'readings.csv'); toast.success('CSV downloaded'); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <>
      <Card title="All fields" sub="Latest reading per sensor · tap a row to see its charts">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Field</th><th className="num">Moisture %</th><th className="num">Temp °C</th><th className="num hide-sm">Humidity %</th><th className="hide-sm">Sensors</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((f) => {
                const ms = moistureStatus(f.soil_moisture, t);
                return (
                  <tr key={f.field_id} onClick={() => setParams({ field: f.field_id })} style={{ cursor: 'pointer', background: f.field_id === fieldId ? 'var(--surface-3)' : undefined }}
                    aria-selected={f.field_id === fieldId}>
                    <td><b>{f.field_name}</b><div className="muted" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>{f.field_id} · {fmtNum(f.area_acres, 2)} ac</div></td>
                    <td className="num">{fmtNum(f.soil_moisture)}</td>
                    <td className="num">{fmtNum(f.temperature)}</td>
                    <td className="num hide-sm">{fmtNum(f.humidity)}</td>
                    <td className="hide-sm">{f.sensors_unhealthy > 0 ? <Badge tone="warning" icon={WifiOff}>{f.sensor_count - f.sensors_unhealthy}/{f.sensor_count}</Badge> : <Badge tone="success" icon={Wifi}>{f.sensor_count}/{f.sensor_count}</Badge>}</td>
                    <td>{ms.tone === 'neutral' ? <span className="muted">No data</span> : <Badge tone={ms.tone}>{ms.label}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="filters">
        <Select label="Field" value={fieldId} onChange={(e) => setParams({ field: e.target.value })}
          options={list.map((f) => ({ value: f.field_id, label: `${f.field_name} (${f.field_id})` }))} />
        <div className="form-field">
          <span className="form-label">Period</span>
          <Segmented label="Chart period" value={period} onChange={setPeriod}
            options={[{ value: 'day', label: '24 h' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }]} />
        </div>
        <div className="spacer" />
        <Button icon={Download} loading={busy} onClick={() => exportCsv(false)}>Export field CSV</Button>
        <Button variant="ghost" icon={Download} onClick={() => exportCsv(true)}>All fields</Button>
      </div>

      {current && (
        <div className="grid grid-3">
          {(sensors.data?.sensors ?? []).map((s) => {
            const meta = SENSOR_META[s.sensor_type];
            const Icon = ICONS[s.sensor_type];
            const [tone, label, HIcon] = HEALTH[s.health] ?? HEALTH.NO_DATA;
            return (
              <div className="card stat" key={s.sensor_id} style={{ transition: 'border-color .3s', borderColor: flash === s.sensor_id ? 'var(--wheat)' : undefined }}>
                <div className="row">
                  <span className="stat-label"><Icon aria-hidden />{meta.label}</span>
                  <div className="spacer" />
                  <Badge tone={tone} icon={HIcon}>{label}</Badge>
                </div>
                <span className="stat-value">{s.last_reading == null ? '—' : fmtNum(s.last_reading)}<small>{meta.unit}</small></span>
                <span className="stat-foot">
                  <span className="num">{s.sensor_id}</span> · {s.sensor_location} · updated {timeAgo(s.last_reading_at)}
                  {s.missing_pct_24h > 0 && <> · <span style={{ color: s.missing_pct_24h > 20 ? 'var(--warning)' : undefined }}>{fmtNum(s.missing_pct_24h)}% missing (24 h)</span></>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {sensors.loading && !sensors.data ? <Spinner /> : sensors.error ? <ErrorState error={sensors.error} onRetry={sensors.reload} /> : (
        <div className="stack">
          {(sensors.data?.sensors ?? []).map((s) => <SensorChart key={`${s.sensor_id}-${period}`} sensor={s} period={period} t={t} />)}
        </div>
      )}
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Gaps in a line mean the sensor sent no valid data for that period — they are shown, not filled in.</p>
    </>
  );
}
