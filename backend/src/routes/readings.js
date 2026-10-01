import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { ah, badRequest, forbidden } from '../lib/errors.js';
import { requireAuth, requireAuthOrDevice } from '../middleware/auth.js';
import { ownedSensor } from '../lib/ownership.js';
import { evaluateField } from '../services/engine.js';
import { publish } from '../services/events.js';

const r = Router();

// physically plausible ranges per sensor type — values outside become MISSING
const PLAUSIBLE = { SOIL_MOISTURE: [0, 100], TEMPERATURE: [-20, 60], HUMIDITY: [0, 100] };

const readingSchema = z.object({
  sensor_id: z.string().min(1).max(12),
  value: z.union([z.number(), z.string(), z.null()]).optional(),
  timestamp: z.coerce.date().optional(),
  status: z.enum(['GOOD', 'MISSING']).optional(),
});
const batchSchema = z.object({ readings: z.array(readingSchema).min(1).max(1000) });

/**
 * POST /api/readings — batch upload (from IoT gateway with X-Device-Key, or a farmer JWT)
 * Missing / null / non-numeric / out-of-range values are stored as status=MISSING.
 * Re-uploading the same (sensor_id, timestamp) overwrites → uploads are idempotent.
 */
r.post('/', requireAuthOrDevice, ah(async (req, res) => {
  const { readings } = batchSchema.parse(Array.isArray(req.body) ? { readings: req.body } : req.body);
  const ids = [...new Set(readings.map((x) => x.sensor_id))];
  const { rows: sensors } = await query(
    `SELECT s.sensor_id, s.sensor_type, s.field_id, s.is_active, f.farmer_id
       FROM sensors s JOIN fields f USING (field_id) WHERE s.sensor_id = ANY($1)`, [ids]);
  const byId = Object.fromEntries(sensors.map((s) => [s.sensor_id, s]));

  const rejected = []; const rows = []; let missing = 0;
  const now = Date.now();
  readings.forEach((rd, index) => {
    const s = byId[rd.sensor_id];
    if (!s) return rejected.push({ index, sensor_id: rd.sensor_id, reason: 'Unknown sensor' });
    if (req.user && s.farmer_id !== req.user.farmerId) return rejected.push({ index, sensor_id: rd.sensor_id, reason: 'Not your sensor' });
    if (!s.is_active) return rejected.push({ index, sensor_id: rd.sensor_id, reason: 'Sensor is inactive' });
    const ts = rd.timestamp ?? new Date();
    if (Number.isNaN(ts.getTime()) || ts.getTime() > now + 5 * 60_000) return rejected.push({ index, sensor_id: rd.sensor_id, reason: 'Invalid or future timestamp' });
    let value = rd.value === '' || rd.value == null ? null : Number(rd.value);
    let reason = null;
    if (value !== null && !Number.isFinite(value)) { value = null; reason = 'non-numeric'; }
    const [lo, hi] = PLAUSIBLE[s.sensor_type];
    if (value !== null && (value < lo || value > hi)) { value = null; reason = 'out-of-range'; }
    const status = rd.status === 'MISSING' || value === null ? 'MISSING' : 'GOOD';
    if (status === 'MISSING') { value = null; missing++; }
    rows.push({ sensor_id: s.sensor_id, value: value === null ? null : Math.round(value * 100) / 100, ts, status, s, reason });
  });
  if (!rows.length) throw badRequest('No valid readings in batch', { rejected });

  await tx(async (c) => {
    await c.query(
      `INSERT INTO sensor_readings (sensor_id, value, "timestamp", status)
       SELECT * FROM unnest($1::varchar[], $2::numeric[], $3::timestamptz[], $4::varchar[])
       ON CONFLICT (sensor_id, "timestamp") DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status`,
      [rows.map((x) => x.sensor_id), rows.map((x) => x.value), rows.map((x) => x.ts), rows.map((x) => x.status)]);
  });

  // re-run the recommendation engine for every affected field, then notify live dashboards
  const fieldIds = [...new Set(rows.map((x) => x.s.field_id))];
  const evaluations = [];
  for (const fid of fieldIds) evaluations.push(await evaluateField(fid));
  for (const x of rows) {
    publish(x.s.farmer_id, 'reading', { sensor_id: x.sensor_id, field_id: x.s.field_id, sensor_type: x.s.sensor_type, value: x.value, status: x.status, timestamp: x.ts });
  }
  for (const e of evaluations) {
    if (e && (e.created || e.expired)) {
      const farmerId = sensors.find((s) => s.field_id === e.field_id).farmer_id;
      publish(farmerId, 'recommendations', { field_id: e.field_id, created: e.created, expired: e.expired });
    }
  }
  res.status(201).json({
    accepted: rows.length, stored_as_missing: missing, rejected,
    fields_evaluated: fieldIds.length,
    recommendations_created: evaluations.reduce((a, e) => a + (e?.created ?? 0), 0),
  });
}));

// GET /api/readings/:sensorId/latest?limit=100
r.get('/:sensorId/latest', requireAuth, ah(async (req, res) => {
  const sensor = await ownedSensor(req.params.sensorId, req.user.farmerId);
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100) }).parse(req.query);
  const { rows } = await query(
    `SELECT reading_id, value, "timestamp", status FROM sensor_readings WHERE sensor_id = $1 ORDER BY "timestamp" DESC LIMIT $2`,
    [sensor.sensor_id, limit]);
  res.json({ sensor_id: sensor.sensor_id, sensor_type: sensor.sensor_type, unit: sensor.unit, readings: rows });
}));

// GET /api/readings/:sensorId/analytics?period=day|week|month
const PERIODS = { day: ['1 day', '1 hour'], week: ['7 days', '6 hours'], month: ['30 days', '1 day'] };
r.get('/:sensorId/analytics', requireAuth, ah(async (req, res) => {
  const sensor = await ownedSensor(req.params.sensorId, req.user.farmerId);
  const { period } = z.object({ period: z.enum(['day', 'week', 'month']).default('week') }).parse(req.query);
  const [span, bucket] = PERIODS[period];
  const { rows: series } = await query(
    `SELECT date_bin($2::interval, "timestamp", '2000-01-01'::timestamptz) AS bucket,
            round(avg(value), 2) AS avg, min(value) AS min, max(value) AS max,
            count(*) FILTER (WHERE status = 'GOOD')::int AS good, count(*) FILTER (WHERE status = 'MISSING')::int AS missing
       FROM sensor_readings
      WHERE sensor_id = $1 AND "timestamp" > now() - $3::interval
      GROUP BY 1 ORDER BY 1`, [sensor.sensor_id, bucket, span]);
  const { rows: [summary] } = await query(
    `SELECT round(avg(value), 2) AS avg, min(value) AS min, max(value) AS max, round(stddev_samp(value), 2) AS stddev,
            count(*)::int AS total, count(*) FILTER (WHERE status = 'MISSING')::int AS missing,
            round(100.0 * count(*) FILTER (WHERE status = 'MISSING') / NULLIF(count(*), 0), 1) AS missing_pct,
            -- least-squares slope in units per day (positive = rising)
            round((regr_slope(value, extract(epoch FROM "timestamp")) * 86400)::numeric, 3) AS trend_per_day
       FROM sensor_readings WHERE sensor_id = $1 AND "timestamp" > now() - $2::interval`, [sensor.sensor_id, span]);
  const trend = summary.trend_per_day == null ? 'unknown'
    : Math.abs(summary.trend_per_day) < 0.2 ? 'stable' : summary.trend_per_day > 0 ? 'rising' : 'falling';
  res.json({ sensor_id: sensor.sensor_id, sensor_type: sensor.sensor_type, unit: sensor.unit, period, bucket, summary: { ...summary, trend }, series });
}));

export default r;
