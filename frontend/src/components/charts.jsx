import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  BarChart, Bar, Legend,
} from 'recharts';
import { Table } from 'lucide-react';
import { fmtNum, fmtTick, fmtDateTime } from '../lib/format.js';

const axisProps = {
  stroke: 'var(--viz-axis)', tick: { fill: 'var(--viz-axis)', fontSize: 12 }, tickLine: false, axisLine: { stroke: 'var(--viz-grid)' },
};

function SeriesTooltip({ active, payload, label, unit, labelFmt = fmtDateTime }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{labelFmt(label)}</div>
      {payload.map((p) => (
        <div className="tt-row" key={p.dataKey}>
          <span className="tt-dot" style={{ background: p.color }} />
          <span className="secondary">{p.name}</span>
          <b className="num" style={{ marginLeft: 'auto' }}>{p.value == null ? 'missing' : `${fmtNum(p.value, 1)}${p.unit ?? unit ?? ''}`}</b>
        </div>
      ))}
    </div>
  );
}

/** Toggle between a chart and an accessible data table. */
export function ChartFrame({ title, sub, legend, table, children, actions }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card">
      <header className="card-header">
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="spacer" />
        {actions}
        {table && (
          <button className="btn btn-ghost btn-sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            <Table aria-hidden /> {asTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>
      {asTable ? <div className="table-wrap" style={{ maxHeight: 280 }}>{table}</div> : <>{children}{legend}</>}
    </section>
  );
}

/**
 * Single-metric time series (one y-axis — never mix units).
 * Missing readings are null → drawn as gaps so data loss is visible.
 * `band` shades the target range; `lines` draws dashed threshold references.
 */
export function MetricChart({ data, dataKey = 'value', name, unit, color, period = 'week', band, lines = [], domain = ['auto', 'auto'], height }) {
  return (
    <div className="chart-box" style={height ? { height } : undefined}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#4ADE80" fillOpacity={0.06} stroke="none" ifOverflow="extendDomain" />}
          {lines.map((l) => (
            <ReferenceLine key={l.label} y={l.y} stroke={l.color} strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain"
              label={{ value: l.label, position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }} />
          ))}
          <XAxis dataKey="t" {...axisProps} tickFormatter={(t) => fmtTick(t, period)} minTickGap={36}
            ticks={period === 'week' ? data.filter((_, i) => i % 4 === 0).map((d) => d.t) : undefined} />
          <YAxis {...axisProps} domain={domain} width={48} tickFormatter={(v) => fmtNum(v, 0)} />
          <Tooltip content={<SeriesTooltip unit={unit} />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
          <Line type="monotone" dataKey={dataKey} name={name} unit={unit} stroke={color} strokeWidth={2} dot={false}
            activeDot={{ r: 5, stroke: 'var(--surface-1)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series comparison on the same unit (e.g. your yield vs district). */
export function CompareLines({ data, xKey, series, unit, height = 260 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={48} domain={['auto', 'auto']} />
          <Tooltip content={<SeriesTooltip unit={unit} labelFmt={(l) => l} />} cursor={{ stroke: 'var(--border-strong)' }} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined}
              dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)', fill: s.color }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, xKey, yKey, name, unit, color = 'var(--series-moisture)', xFmt, yFmt = (v) => fmtNum(v, 0), height = 240, layout = 'horizontal' }) {
  const vertical = layout === 'vertical';
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, bottom: 0, left: vertical ? 8 : -8 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--viz-grid)" vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" {...axisProps} tickFormatter={yFmt} />
              <YAxis type="category" dataKey={xKey} {...axisProps} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFmt} minTickGap={16} />
              <YAxis {...axisProps} tickFormatter={yFmt} width={56} />
            </>
          )}
          <Tooltip content={<SeriesTooltip unit={unit} labelFmt={(l) => (xFmt ? xFmt(l) : l)} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey={yKey} name={name} unit={unit} fill={color} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const LegendRow = ({ items }) => (
  <div className="legend" style={{ marginTop: 'var(--sp-3)' }}>
    {items.map((i) => <span key={i.label}><i className={i.dashed ? 'dashed' : ''} style={{ background: i.color, color: i.color }} />{i.label}</span>)}
  </div>
);

export { Legend };
