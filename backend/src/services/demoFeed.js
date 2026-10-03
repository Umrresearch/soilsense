/**
 * Demo sensor feed (enable with DEMO_FEED=true).
 *
 * Without real devices the seeded readings would go stale and every sensor would
 * show "offline". When enabled, this tops up each active sensor with synthetic
 * readings from its last reading up to "now" (hourly, max 7 days back), using the
 * same physical model as the seed script, then re-runs the recommendation engine.
 * It runs once at start-up (free hosts wake on the first request) and every 15 min.
 *
 * Real deployments: leave DEMO_FEED unset and post readings to POST /api/readings.
 */
import { pool } from '../db.js';
import { evaluateField } from './engine.js';
import { publish } from './events.js';

const STEP_MS = 60 * 60 * 1000;
const MAX_BACKFILL_MS = 7 * 24 * STEP_MS;
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let running = false;

export async function topUp() {
  if (running) return null;
  running = true;
  const started = Date.now();
  try {
    const { rows: sensors } = await pool.query(
      `SELECT s.sensor_id, s.sensor_type, s.field_id, s.last_reading, s.last_reading_at,
              (SELECT max("timestamp") FROM sensor_readings r WHERE r.sensor_id = s.sensor_id) AS last_any_at,
              f.farmer_id, f.area_acres, f.irrigation_method, f.pump_flow_lph,
              t.moisture_low, t.moisture_target
         FROM sensors s JOIN fields f USING (field_id) JOIN thresholds t USING (farmer_id)
        WHERE s.is_active`);
    const now = Date.now();
    const rows = [];
    const irrigations = [];
    const touchedFields = new Set();

    for (const s of sensors) {
      const lastTs = new Date(s.last_any_at ?? s.last_reading_at ?? now - 2 * STEP_MS).getTime();
      let t = Math.max(lastTs, now - MAX_BACKFILL_MS) + STEP_MS;
      if (t > now) continue;
      let v = s.last_reading ?? { SOIL_MOISTURE: 28, TEMPERATURE: 28, HUMIDITY: 70 }[s.sensor_type];
      for (; t <= now; t += STEP_MS) {
        const d = new Date(t);
        const ist = (d.getUTCHours() + d.getUTCMinutes() / 60 + 5.5) % 24;
        const diurnal = Math.sin(((ist - 9) / 24) * 2 * Math.PI);           // peak ≈ 15:00 IST
        if (s.sensor_type === 'SOIL_MOISTURE') {
          v -= 0.1 + Math.random() * 0.08 + gauss() * 0.05;                    // soil dries out
          if (v < s.moisture_low - 2 && Math.random() < 0.12) {               // farmer irrigates now and then
            irrigations.push({ field_id: s.field_id, ts: d, area: s.area_acres, method: s.irrigation_method, flow: s.pump_flow_lph, from: v, to: s.moisture_target });
            v = s.moisture_target + Math.random() * 3;
          }
          v = clamp(v, 8, 45);
        } else if (s.sensor_type === 'TEMPERATURE') {
          v += (29 + 6 * diurnal - v) * 0.35 + gauss() * 0.6;
          v = clamp(v, 5, 48);
        } else {
          v += (70 - 12 * diurnal - v) * 0.35 + gauss() * 1.5;
          v = clamp(v, 20, 99);
        }
        const missing = Math.random() < 0.025;
        rows.push([s.sensor_id, missing ? null : Math.round(v * 100) / 100, d, missing ? 'MISSING' : 'GOOD']);
      }
      touchedFields.add(s.field_id);
    }
    if (!rows.length) return { inserted: 0 };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i += 5000) {
        const part = rows.slice(i, i + 5000);
        await client.query(
          `INSERT INTO sensor_readings (sensor_id, value, "timestamp", status)
           SELECT * FROM unnest($1::varchar[], $2::numeric[], $3::timestamptz[], $4::varchar[])
           ON CONFLICT (sensor_id, "timestamp") DO NOTHING`,
          [part.map((r) => r[0]), part.map((r) => r[1]), part.map((r) => r[2]), part.map((r) => r[3])]);
      }
      // one irrigation log per simulated irrigation event (dedupe per field+hour)
      const seen = new Set();
      for (const e of irrigations) {
        const key = `${e.field_id}|${e.ts.toISOString().slice(0, 13)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const effic = { Flood: 0.6, Sprinkler: 0.75, Drip: 0.9 }[e.method] ?? 0.6;
        const litres = Math.round((((e.to - e.from) / 100) * 450 * e.area * 4046.86) / effic);
        const minutes = Math.min(1440, Math.max(1, Math.round((litres / e.flow) * 60)));
        await client.query(
          `INSERT INTO irrigation_logs (field_id, "timestamp", duration, water_amount, method, notes) VALUES ($1,$2,$3,$4,$5,'Demo feed: simulated irrigation')`,
          [e.field_id, e.ts, minutes, litres, e.method]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    for (const fid of touchedFields) await evaluateField(fid);
    const farmers = new Set(sensors.map((s) => s.farmer_id));
    for (const fid of farmers) publish(fid, 'recommendations', { demo: true });
    const res = { inserted: rows.length, irrigations: irrigations.length, fields: touchedFields.size, ms: Date.now() - started };
    console.log('[demo-feed]', res);
    return res;
  } catch (e) {
    console.error('[demo-feed] failed:', e.message);
    return null;
  } finally {
    running = false;
  }
}

export function startDemoFeed() {
  setTimeout(() => topUp(), 3000).unref();
  setInterval(() => topUp(), 15 * 60 * 1000).unref();
  console.log('[demo-feed] enabled — synthetic sensor readings keep the demo live');
}
