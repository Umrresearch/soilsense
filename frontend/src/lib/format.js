const IN = 'en-IN';

export const fmtNum = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString(IN, { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const fmtLitres = (l) => {
  if (l == null) return '—';
  if (l >= 1e6) return `${fmtNum(l / 1e6, 2)} ML`;
  if (l >= 1e4) return `${fmtNum(l / 1000, 0)} kL`;
  return `${fmtNum(l, 0)} L`;
};
export const fmtMinutes = (m) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} min`);

export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString(IN, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(IN, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTick = (ts, period) => {
  const d = new Date(ts);
  return period === 'day'
    ? d.toLocaleTimeString(IN, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(IN, { day: 'numeric', month: 'short' });
};

export const SENSOR_META = {
  SOIL_MOISTURE: { label: 'Soil moisture', short: 'Moisture', unit: '%', color: 'var(--series-moisture)', hex: '#3987E5' },
  TEMPERATURE:   { label: 'Temperature',   short: 'Temp',     unit: '°C', color: 'var(--series-temperature)', hex: '#D95926' },
  HUMIDITY:      { label: 'Humidity',      short: 'Humidity', unit: '%', color: 'var(--series-humidity)', hex: '#199E70' },
};

export const PRIORITY = {
  CRITICAL: { label: 'Critical', tone: 'danger', rank: 4 },
  HIGH:     { label: 'High',     tone: 'warning', rank: 3 },
  MEDIUM:   { label: 'Medium',   tone: 'info', rank: 2 },
  LOW:      { label: 'Low',      tone: 'emerald', rank: 1 },
};

/** Status of a soil-moisture value against the farmer's thresholds */
export function moistureStatus(v, t) {
  if (v == null || !t) return { tone: 'neutral', label: 'No data' };
  if (v < t.moisture_critical) return { tone: 'danger', label: 'Critical — dry' };
  if (v < t.moisture_low) return { tone: 'warning', label: 'Dry' };
  if (v > t.moisture_high) return { tone: 'info', label: 'Waterlogged' };
  return { tone: 'success', label: 'Good' };
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
