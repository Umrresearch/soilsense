import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ah } from '../lib/errors.js';
import { requireAuth, requireSelf } from '../middleware/auth.js';
import { fieldSummarySql } from './fields.js';

const r = Router();
r.use(requireAuth);

// GET /api/dashboard/:farmerId/summary
r.get('/:farmerId/summary', requireSelf('farmerId'), ah(async (req, res) => {
  const id = req.params.farmerId;
  const [{ rows: [totals] }, { rows: [sensors] }, { rows: recs }, { rows: [water] }, { rows: [fert] }, { rows: fields }] = await Promise.all([
    query(`SELECT count(*)::int AS fields, COALESCE(sum(area_acres),0) AS total_area_acres FROM fields WHERE farmer_id = $1`, [id]),
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE health = 'ONLINE')::int   AS online,
                  count(*) FILTER (WHERE health = 'STALE')::int    AS stale,
                  count(*) FILTER (WHERE health = 'NO_DATA')::int  AS no_data,
                  count(*) FILTER (WHERE health = 'INACTIVE')::int AS inactive,
                  round(avg(last_reading) FILTER (WHERE sensor_type = 'SOIL_MOISTURE' AND health = 'ONLINE'), 1) AS avg_soil_moisture,
                  round(avg(last_reading) FILTER (WHERE sensor_type = 'TEMPERATURE'   AND health = 'ONLINE'), 1) AS avg_temperature,
                  round(avg(last_reading) FILTER (WHERE sensor_type = 'HUMIDITY'      AND health = 'ONLINE'), 1) AS avg_humidity,
                  max(last_reading_at) AS last_update
             FROM v_sensor_status v JOIN fields f USING (field_id) WHERE f.farmer_id = $1`, [id]),
    query(`SELECT r.type, r.priority, count(*)::int AS n FROM recommendations r JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND r.status = 'PENDING' GROUP BY 1, 2`, [id]),
    query(`SELECT COALESCE(sum(water_amount) FILTER (WHERE l."timestamp" > now() - interval '7 days'),0) AS litres_7d,
                  count(*) FILTER (WHERE l."timestamp" > now() - interval '7 days')::int AS sessions_7d,
                  COALESCE(sum(water_amount) FILTER (WHERE l."timestamp" <= now() - interval '7 days'),0) AS litres_prev_7d
             FROM irrigation_logs l JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND l."timestamp" > now() - interval '14 days'`, [id]),
    query(`SELECT COALESCE(sum(amount),0) AS kg_30d, count(*)::int AS applications_30d
             FROM fertilizer_logs l JOIN fields f USING (field_id) WHERE f.farmer_id = $1 AND l."timestamp" > now() - interval '30 days'`, [id]),
    query(`${fieldSummarySql} WHERE f.farmer_id = $1 ORDER BY top_priority_rank DESC NULLS LAST, f.field_id`, [id]),
  ]);
  // trend context for the KPI cards: soil moisture ~24 h ago, advice applied this week
  const { rows: [trend] } = await query(
    `SELECT round(avg(r.value) FILTER (WHERE r."timestamp" BETWEEN now() - interval '27 hours' AND now() - interval '21 hours'), 1) AS soil_moisture_24h_ago,
            (SELECT count(*)::int FROM recommendations rc JOIN fields f2 USING (field_id)
              WHERE f2.farmer_id = $1 AND rc.status = 'APPLIED' AND rc.resolved_at > now() - interval '7 days') AS applied_7d
       FROM sensor_readings r JOIN sensors s USING (sensor_id) JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND s.sensor_type = 'SOIL_MOISTURE' AND r.status = 'GOOD'
        AND r."timestamp" > now() - interval '27 hours'`, [id]);
  const pending = { total: 0, byType: { IRRIGATION: 0, FERTILIZER: 0, ALERT: 0 }, byPriority: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } };
  for (const x of recs) { pending.total += x.n; pending.byType[x.type] += x.n; pending.byPriority[x.priority] += x.n; }
  res.json({ farmer_id: id, totals, sensors, pending, water, fertilizer: fert, trend, fields, generated_at: new Date().toISOString() });
}));

// GET /api/dashboard/:farmerId/alerts — urgent recommendations + sensor problems
r.get('/:farmerId/alerts', requireSelf('farmerId'), ah(async (req, res) => {
  const id = req.params.farmerId;
  const { rows: alerts } = await query(
    `SELECT r.rec_id, r.field_id, f.field_name, r.type, r.priority, r.action, r.rule_code, r."timestamp"
       FROM recommendations r JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND r.status = 'PENDING' AND (r.priority IN ('CRITICAL','HIGH') OR r.type = 'ALERT')
      ORDER BY CASE r.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, r."timestamp" DESC
      LIMIT 50`, [id]);
  const { rows: sensorIssues } = await query(
    `SELECT v.sensor_id, v.field_id, f.field_name, v.sensor_type, v.health, v.last_reading_at
       FROM v_sensor_status v JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND v.health IN ('STALE','NO_DATA') ORDER BY v.last_reading_at NULLS FIRST`, [id]);
  res.json({ alerts, sensorIssues, count: alerts.length + sensorIssues.length });
}));

// GET /api/dashboard/:farmerId/analytics?period=week|month|quarter
const SPAN = { week: '7 days', month: '30 days', quarter: '90 days' };
r.get('/:farmerId/analytics', requireSelf('farmerId'), ah(async (req, res) => {
  const id = req.params.farmerId;
  const { period } = z.object({ period: z.enum(['week', 'month', 'quarter']).default('month') }).parse(req.query);
  const span = SPAN[period];
  const [daily, water, fert, yields, compare, recStats] = await Promise.all([
    // daily averages per sensor type across all fields
    query(`SELECT date_trunc('day', r."timestamp" AT TIME ZONE 'Asia/Kolkata')::date AS day, s.sensor_type,
                  round(avg(r.value), 2) AS avg, min(r.value) AS min, max(r.value) AS max,
                  round(100.0 * count(*) FILTER (WHERE r.status = 'MISSING') / count(*), 1) AS missing_pct
             FROM sensor_readings r JOIN sensors s USING (sensor_id) JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND r."timestamp" > now() - $2::interval
            GROUP BY 1, 2 ORDER BY 1`, [id, span]),
    query(`SELECT date_trunc('day', l."timestamp" AT TIME ZONE 'Asia/Kolkata')::date AS day, l.field_id, f.field_name,
                  sum(l.water_amount) AS litres, sum(l.duration)::int AS minutes
             FROM irrigation_logs l JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND l."timestamp" > now() - $2::interval GROUP BY 1, 2, 3 ORDER BY 1`, [id, span]),
    query(`SELECT l.type, sum(l.amount) AS kg, count(*)::int AS applications
             FROM fertilizer_logs l JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND l."timestamp" > now() - interval '180 days' GROUP BY 1 ORDER BY 2 DESC`, [id]),
    // historical yield per season year (farmer vs district average)
    query(`WITH mine AS (
             SELECT c.season_year AS year, round(avg(c.yield_q_per_acre), 1) AS yield_q_per_acre, count(*)::int AS records
               FROM crop_records c JOIN fields f USING (field_id)
              WHERE f.farmer_id = $1 AND c.season_year IS NOT NULL GROUP BY 1),
           district AS (
             SELECT c.season_year AS year, round(avg(c.yield_q_per_acre), 1) AS district_avg
               FROM crop_records c JOIN fields f USING (field_id) JOIN farmers fa USING (farmer_id)
              WHERE fa.district = (SELECT district FROM farmers WHERE farmer_id = $1) AND c.season_year IS NOT NULL GROUP BY 1)
           SELECT m.*, d.district_avg FROM mine m LEFT JOIN district d USING (year) ORDER BY year`, [id]),
    // per-field comparison
    query(`SELECT f.field_id, f.field_name, f.area_acres, f.soil_type, f.irrigation_method,
                  round(avg(c.yield_q_per_acre), 1) AS avg_yield_q_per_acre,
                  round(avg(c.brix_value), 2) AS avg_brix,
                  (SELECT COALESCE(sum(water_amount),0) FROM irrigation_logs l WHERE l.field_id = f.field_id AND l."timestamp" > now() - $2::interval) AS water_litres,
                  round((SELECT COALESCE(sum(water_amount),0) FROM irrigation_logs l WHERE l.field_id = f.field_id AND l."timestamp" > now() - $2::interval) / f.area_acres) AS water_litres_per_acre
             FROM fields f LEFT JOIN crop_records c USING (field_id)
            WHERE f.farmer_id = $1 GROUP BY f.field_id ORDER BY f.field_id`, [id, span]),
    query(`SELECT r.type, r.status, count(*)::int AS n FROM recommendations r JOIN fields f USING (field_id)
            WHERE f.farmer_id = $1 AND r."timestamp" > now() - $2::interval GROUP BY 1, 2`, [id, span]),
  ]);

  // simple linear-trend yield forecast for next season (needs ≥ 3 seasons)
  const pts = yields.rows.filter((y) => y.yield_q_per_acre != null);
  let prediction = null;
  if (pts.length >= 3) {
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.year, 0) / n;
    const my = pts.reduce((a, p) => a + p.yield_q_per_acre, 0) / n;
    const slope = pts.reduce((a, p) => a + (p.year - mx) * (p.yield_q_per_acre - my), 0) /
                  pts.reduce((a, p) => a + (p.year - mx) ** 2, 0);
    const nextYear = Math.max(...pts.map((p) => p.year)) + 1;
    const predicted = my + slope * (nextYear - mx);
    const resid = Math.sqrt(pts.reduce((a, p) => a + (p.yield_q_per_acre - (my + slope * (p.year - mx))) ** 2, 0) / Math.max(1, n - 2));
    prediction = {
      year: nextYear, yield_q_per_acre: Math.round(predicted * 10) / 10,
      range: [Math.round((predicted - 1.96 * resid) * 10) / 10, Math.round((predicted + 1.96 * resid) * 10) / 10],
      trend_q_per_year: Math.round(slope * 10) / 10, method: 'Linear trend on historical season averages (indicative only)',
    };
  }
  res.json({ period, daily: daily.rows, water: water.rows, fertilizer: fert.rows, yields: yields.rows, prediction, fields: compare.rows, recommendations: recStats.rows });
}));

export default r;
