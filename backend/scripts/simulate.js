/**
 * Live sensor simulator — behaves like an IoT gateway posting to POST /api/readings.
 *
 *   npm run simulate                                   # all sensors, every 15 s, local API
 *   npm run simulate -- --farmer FRM-0051 --interval 5
 *   API_URL=https://your-api.onrender.com INGEST_API_KEY=... npm run simulate -- --farmer FRM-0051
 *
 * Each tick it reads the latest value of each sensor (via the DB), applies a small random walk
 * (soil dries out, temperature follows the time of day, humidity mirrors temperature),
 * jumps soil moisture up if an irrigation was logged since the last reading,
 * and drops ~3 % of readings as MISSING to exercise missing-data handling.
 */
import { pool } from '../src/db.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const KEY = process.env.INGEST_API_KEY;
const FARMER = arg('farmer', null);
const INTERVAL = Number(arg('interval', 15)) * 1000;
const ONCE = process.argv.includes('--once');

if (!KEY) { console.error('INGEST_API_KEY must be set (same value as the API server).'); process.exit(1); }

const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

async function tick() {
  const { rows } = await pool.query(
    `SELECT s.sensor_id, s.sensor_type, s.last_reading, s.last_reading_at, f.field_id,
            (SELECT max("timestamp") FROM irrigation_logs l WHERE l.field_id = f.field_id) AS last_irrigation,
            t.moisture_target
       FROM sensors s JOIN fields f USING (field_id) JOIN thresholds t USING (farmer_id)
      WHERE s.is_active AND ($1::text IS NULL OR f.farmer_id = $1)`, [FARMER]);
  const now = new Date();
  const ist = (now.getUTCHours() + 5.5) % 24;
  const diurnal = Math.sin(((ist - 9) / 24) * 2 * Math.PI);
  const readings = rows.map((s) => {
    let v = s.last_reading ?? { SOIL_MOISTURE: 28, TEMPERATURE: 28, HUMIDITY: 70 }[s.sensor_type];
    if (s.sensor_type === 'SOIL_MOISTURE') {
      const irrigatedSince = s.last_irrigation && (!s.last_reading_at || s.last_irrigation > s.last_reading_at);
      v = irrigatedSince ? s.moisture_target + 2 + Math.random() * 2 : v - 0.05 + gauss() * 0.08;
    } else if (s.sensor_type === 'TEMPERATURE') {
      v += (28 + 6 * diurnal - v) * 0.1 + gauss() * 0.3;
    } else {
      v += (70 - 12 * diurnal - v) * 0.1 + gauss() * 0.8;
    }
    v = Math.max(0, Math.min(99, v));
    const missing = Math.random() < 0.03;
    return { sensor_id: s.sensor_id, value: missing ? null : Math.round(v * 100) / 100, timestamp: now.toISOString() };
  });
  for (let i = 0; i < readings.length; i += 1000) {
    const resp = await fetch(`${API}/api/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': KEY },
      body: JSON.stringify({ readings: readings.slice(i, i + 1000) }),
    });
    const body = await resp.json();
    console.log(`[${now.toLocaleTimeString('en-IN')}] HTTP ${resp.status}`, resp.ok
      ? `accepted=${body.accepted} missing=${body.stored_as_missing} recs+${body.recommendations_created}` : body.error);
  }
}

async function main() {
  console.log(`Simulating ${FARMER ?? 'all farmers'} → ${API} every ${INTERVAL / 1000}s (Ctrl+C to stop)`);
  await tick();
  if (ONCE) return pool.end();
  setInterval(() => tick().catch((e) => console.error(e.message)), INTERVAL);
}
main().catch((e) => { console.error(e); process.exit(1); });
