import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Droplets, Sprout, CircleCheck, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { fmtNum, fmtLitres, fmtDate, SENSOR_META } from '../lib/format.js';
import { Button, Card, EmptyState, ErrorState, Segmented, Spinner, StatCard } from '../components/ui.jsx';
import { ChartFrame, MetricChart, CompareLines, Bars, LegendRow } from '../components/charts.jsx';

export default function Analytics() {
  const { farmer } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const a = useApi(`/api/dashboard/${farmer.farmer_id}/analytics?period=${period}`);

  const derived = useMemo(() => {
    if (!a.data) return null;
    const byType = { SOIL_MOISTURE: [], TEMPERATURE: [], HUMIDITY: [] };
    for (const d of a.data.daily) byType[d.sensor_type]?.push({ t: d.day, value: d.avg, min: d.min, max: d.max, missing_pct: d.missing_pct });
    const waterByDay = {};
    for (const w of a.data.water) waterByDay[w.day] = (waterByDay[w.day] ?? 0) + w.litres;
    const water = Object.entries(waterByDay).map(([day, litres]) => ({ day, kL: Math.round(litres / 100) / 10 })).sort((x, y) => x.day.localeCompare(y.day));
    const totalWater = a.data.water.reduce((s, w) => s + w.litres, 0);
    const recs = { APPLIED: 0, DISMISSED: 0, EXPIRED: 0, PENDING: 0 };
    for (const r of a.data.recommendations) recs[r.status] += r.n;
    const decided = recs.APPLIED + recs.DISMISSED;
    return { byType, water, totalWater, recs, adoption: decided ? Math.round((100 * recs.APPLIED) / decided) : null };
  }, [a.data]);

  if (a.loading && !a.data) return <Spinner label="Crunching your farm history…" />;
  if (a.error) return <ErrorState error={a.error} onRetry={a.reload} />;
  const { prediction, yields, fields, fertilizer } = a.data;
  const latestYield = yields.at(-1);

  return (
    <>
      <div className="filters">
        <div className="form-field">
          <span className="form-label">Period</span>
          <Segmented label="Analytics period" value={period} onChange={setPeriod}
            options={[{ value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }, { value: 'quarter', label: '90 days' }]} />
        </div>
        <div className="spacer" />
        <Button icon={Download} onClick={() => download('/api/export/logs.csv', 'farm-logs.csv').catch((e) => toast.error(e))}>Export logs CSV</Button>
      </div>

      <div className="grid grid-4">
        <StatCard icon={Droplets} label={`Water used · ${period === 'week' ? '7' : period === 'month' ? '30' : '90'} d`} value={fmtLitres(derived.totalWater)}
          foot={`${a.data.water.length} irrigation-days logged`} />
        <StatCard icon={Sprout} label={`Forecast ${prediction?.year ?? ''}`} value={prediction ? fmtNum(prediction.yield_q_per_acre, 0) : '—'} unit="q/acre"
          foot={prediction ? `95% range ${fmtNum(prediction.range[0], 0)}–${fmtNum(prediction.range[1], 0)} · indicative` : 'Needs 3+ seasons of data'} />
        <StatCard icon={prediction?.trend_q_per_year >= 0 ? TrendingUp : TrendingDown} label="Yield trend"
          value={prediction ? `${prediction.trend_q_per_year > 0 ? '+' : ''}${fmtNum(prediction.trend_q_per_year, 1)}` : '—'} unit="q/acre/yr"
          foot={latestYield ? `${latestYield.year}: ${fmtNum(latestYield.yield_q_per_acre, 0)} vs district ${fmtNum(latestYield.district_avg, 0)}` : ''} />
        <StatCard icon={CircleCheck} label="Advice followed" value={derived.adoption == null ? '—' : derived.adoption} unit={derived.adoption == null ? '' : '%'}
          foot={`${derived.recs.APPLIED} applied · ${derived.recs.DISMISSED} dismissed`} />
      </div>

      <h2>Field conditions — daily farm average</h2>
      <div className="grid grid-3">
        {['SOIL_MOISTURE', 'TEMPERATURE', 'HUMIDITY'].map((k) => {
          const m = SENSOR_META[k];
          const rows = derived.byType[k];
          return (
            <ChartFrame key={k} title={m.label} sub={`${rows.length} days · unit ${m.unit}`}
              table={<table className="table"><thead><tr><th>Day</th><th className="num">Avg</th><th className="num">Min</th><th className="num">Max</th><th className="num">Missing %</th></tr></thead>
                <tbody>{[...rows].reverse().map((r) => <tr key={r.t}><td>{fmtDate(r.t)}</td><td className="num">{fmtNum(r.value)}</td><td className="num">{fmtNum(r.min)}</td><td className="num">{fmtNum(r.max)}</td><td className="num">{fmtNum(r.missing_pct)}</td></tr>)}</tbody></table>}>
              {rows.length ? <MetricChart data={rows} name={m.label} unit={m.unit} color={m.hex} period="month" height={200} domain={k === 'TEMPERATURE' ? ['auto', 'auto'] : [0, 'auto']} />
                : <EmptyState title="No data in this period" />}
            </ChartFrame>
          );
        })}
      </div>

      <div className="grid grid-2">
        <ChartFrame title="Water used per day" sub="All fields, kilolitres"
          table={<table className="table"><thead><tr><th>Day</th><th className="num">kL</th></tr></thead><tbody>{derived.water.map((w) => <tr key={w.day}><td>{fmtDate(w.day)}</td><td className="num">{fmtNum(w.kL)}</td></tr>)}</tbody></table>}>
          {derived.water.length ? <Bars data={derived.water} xKey="day" yKey="kL" name="Water" unit=" kL" xFmt={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
            : <EmptyState icon={Droplets} title="No irrigation logged in this period" />}
        </ChartFrame>
        <ChartFrame title="Fertilizer applied" sub="Last 180 days, kg by product"
          table={<table className="table"><thead><tr><th>Product</th><th className="num">kg</th><th className="num">Applications</th></tr></thead><tbody>{fertilizer.map((f) => <tr key={f.type}><td>{f.type}</td><td className="num">{fmtNum(f.kg, 0)}</td><td className="num">{f.applications}</td></tr>)}</tbody></table>}>
          {fertilizer.length ? <Bars data={fertilizer} xKey="type" yKey="kg" name="Applied" unit=" kg" layout="vertical" color="var(--series-temperature)" height={Math.max(160, fertilizer.length * 56)} />
            : <EmptyState title="No fertilizer logged" />}
        </ChartFrame>
      </div>

      <ChartFrame title="Historical yield" sub="Average quintals per acre by season — your fields vs the district"
        legend={<LegendRow items={[{ label: 'Your fields', color: SENSOR_META.SOIL_MOISTURE.hex }, { label: 'District average', color: SENSOR_META.TEMPERATURE.hex, dashed: true }]} />}
        table={<table className="table"><thead><tr><th>Year</th><th className="num">You (q/acre)</th><th className="num">District</th><th className="num">Records</th></tr></thead>
          <tbody>{yields.map((y) => <tr key={y.year}><td>{y.year}</td><td className="num">{fmtNum(y.yield_q_per_acre)}</td><td className="num">{fmtNum(y.district_avg)}</td><td className="num">{y.records}</td></tr>)}</tbody></table>}>
        {yields.length ? <CompareLines data={yields} xKey="year" unit=" q/acre" series={[
          { key: 'yield_q_per_acre', name: 'Your fields', color: SENSOR_META.SOIL_MOISTURE.hex },
          { key: 'district_avg', name: 'District average', color: SENSOR_META.TEMPERATURE.hex, dashed: true },
        ]} /> : <EmptyState title="No crop records yet">Historical yields appear once crop records are added for your fields.</EmptyState>}
        {prediction && <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 8 }}>{prediction.method}. Weather, variety and disease can move real yields well outside this range.</p>}
      </ChartFrame>

      <Card title="Compare your fields" sub={`Water in the selected period vs long-run yield`}>
        {fields.length === 0 ? <EmptyState title="No fields" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Field</th><th>Soil</th><th>Irrigation</th><th className="num">Area (ac)</th><th className="num">Avg yield (q/ac)</th><th className="num">Avg Brix</th><th className="num">Water</th><th className="num">Water / acre</th></tr></thead>
              <tbody>{fields.map((f) => (
                <tr key={f.field_id}>
                  <td><b>{f.field_name}</b><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{f.field_id}</div></td>
                  <td>{f.soil_type}</td><td>{f.irrigation_method}</td>
                  <td className="num">{fmtNum(f.area_acres, 2)}</td>
                  <td className="num">{fmtNum(f.avg_yield_q_per_acre, 0)}</td>
                  <td className="num">{fmtNum(f.avg_brix, 1)}</td>
                  <td className="num">{fmtLitres(f.water_litres)}</td>
                  <td className="num">{fmtLitres(f.water_litres_per_acre)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
