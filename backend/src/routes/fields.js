import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { ah, badRequest } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ownedField } from '../lib/ownership.js';

const r = Router();
r.use(requireAuth);

/** Field + latest sensor values + health + pending recommendation count (one row per field). */
export const fieldSummarySql = `
  SELECT f.*,
         sm.last_reading AS soil_moisture, sm.last_reading_at AS soil_moisture_at,
         tp.last_reading AS temperature,   tp.last_reading_at AS temperature_at,
         hu.last_reading AS humidity,      hu.last_reading_at AS humidity_at,
         (SELECT count(*)::int FROM sensors s WHERE s.field_id = f.field_id) AS sensor_count,
         (SELECT count(*)::int FROM v_sensor_status v WHERE v.field_id = f.field_id AND v.health <> 'ONLINE') AS sensors_unhealthy,
         (SELECT count(*)::int FROM recommendations rc WHERE rc.field_id = f.field_id AND rc.status = 'PENDING') AS pending_recommendations,
         (SELECT max(priority_rank) FROM (
             SELECT CASE priority WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END AS priority_rank
               FROM recommendations rc WHERE rc.field_id = f.field_id AND rc.status = 'PENDING') p) AS top_priority_rank
    FROM fields f
    LEFT JOIN LATERAL (SELECT last_reading, last_reading_at FROM sensors WHERE field_id = f.field_id AND sensor_type = 'SOIL_MOISTURE' ORDER BY sensor_id LIMIT 1) sm ON true
    LEFT JOIN LATERAL (SELECT last_reading, last_reading_at FROM sensors WHERE field_id = f.field_id AND sensor_type = 'TEMPERATURE'   ORDER BY sensor_id LIMIT 1) tp ON true
    LEFT JOIN LATERAL (SELECT last_reading, last_reading_at FROM sensors WHERE field_id = f.field_id AND sensor_type = 'HUMIDITY'      ORDER BY sensor_id LIMIT 1) hu ON true`;

const fieldSchema = z.object({
  fieldName: z.string().trim().min(1).max(100),
  areaAcres: z.coerce.number().positive().max(1000),
  soilType: z.enum(['Alluvial', 'Loamy', 'Clay', 'Sandy', 'Black', 'Red', 'Laterite']),
  khasraNo: z.coerce.number().int().positive().optional(),
  soilPh: z.coerce.number().min(0).max(14).optional(),
  soilEc: z.coerce.number().min(0).optional(),
  ownershipType: z.enum(['Owned', 'Leased']).optional(),
  irrigationMethod: z.enum(['Flood', 'Drip', 'Sprinkler']).optional(),
  pumpFlowLph: z.coerce.number().int().positive().optional(),
  village: z.string().trim().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  createDefaultSensors: z.boolean().optional(),
});
const COLS = { fieldName: 'field_name', areaAcres: 'area_acres', soilType: 'soil_type', khasraNo: 'khasra_no', soilPh: 'soil_ph',
  soilEc: 'soil_ec', ownershipType: 'ownership_type', irrigationMethod: 'irrigation_method', pumpFlowLph: 'pump_flow_lph',
  village: 'village', latitude: 'latitude', longitude: 'longitude' };

// POST /api/fields  (optionally creates the 3 standard sensors in the same transaction)
r.post('/', ah(async (req, res) => {
  const d = fieldSchema.parse(req.body);
  const result = await tx(async (c) => {
    const cols = ['farmer_id']; const vals = [req.user.farmerId];
    for (const [k, col] of Object.entries(COLS)) if (d[k] !== undefined) { cols.push(col); vals.push(d[k]); }
    const { rows: [field] } = await c.query(
      `INSERT INTO fields (${cols.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
    let sensors = [];
    if (d.createDefaultSensors !== false) {
      ({ rows: sensors } = await c.query(
        `INSERT INTO sensors (field_id, sensor_type, sensor_location)
         SELECT $1, t, l FROM unnest($2::text[], $3::text[]) AS x(t, l) RETURNING *`,
        [field.field_id, ['SOIL_MOISTURE', 'TEMPERATURE', 'HUMIDITY'], ['Root zone, 30 cm deep', 'Canopy, 1.5 m', 'Canopy, 1.5 m']]));
    }
    return { field, sensors };
  });
  res.status(201).json(result);
}));

// GET /api/fields/:id
r.get('/:id', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const { rows: [field] } = await query(`${fieldSummarySql} WHERE f.field_id = $1`, [req.params.id]);
  const { rows: [soil] } = await query(
    `SELECT record_id, season_year, season, variety, nitrogen_kg_acre, phosphorus_kg_acre, potassium_kg_acre, soil_ph, soil_ec, yield_q_per_acre
       FROM crop_records WHERE field_id = $1 ORDER BY season_year DESC NULLS LAST, harvesting_date DESC NULLS LAST LIMIT 1`, [req.params.id]);
  res.json({ field, latestSoilTest: soil ?? null });
}));

// PUT /api/fields/:id
r.put('/:id', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const d = fieldSchema.partial().omit({ createDefaultSensors: true }).strict().parse(req.body);
  const sets = []; const vals = [];
  for (const [k, col] of Object.entries(COLS)) if (d[k] !== undefined) { vals.push(d[k]); sets.push(`${col} = $${vals.length}`); }
  if (!sets.length) throw badRequest('No fields to update');
  vals.push(req.params.id);
  const { rows: [field] } = await query(`UPDATE fields SET ${sets.join(', ')} WHERE field_id = $${vals.length} RETURNING *`, vals);
  res.json({ field });
}));

// DELETE /api/fields/:id   (cascades to sensors, readings, recommendations, logs)
r.delete('/:id', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  await query('DELETE FROM fields WHERE field_id = $1', [req.params.id]);
  res.status(204).end();
}));

// GET /api/fields/:id/sensors
r.get('/:id/sensors', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const { rows } = await query(
    `SELECT v.*, s.created_at,
            (SELECT round(100.0 * count(*) FILTER (WHERE status = 'MISSING') / NULLIF(count(*),0), 1)
               FROM sensor_readings r WHERE r.sensor_id = v.sensor_id AND r."timestamp" > now() - interval '24 hours') AS missing_pct_24h
       FROM v_sensor_status v JOIN sensors s USING (sensor_id)
      WHERE v.field_id = $1
      ORDER BY CASE v.sensor_type WHEN 'SOIL_MOISTURE' THEN 0 WHEN 'TEMPERATURE' THEN 1 ELSE 2 END, v.sensor_id`, [req.params.id]);
  res.json({ sensors: rows });
}));

// GET /api/fields/:id/crop-records
r.get('/:id/crop-records', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const { rows } = await query(
    `SELECT * FROM crop_records WHERE field_id = $1 ORDER BY season_year DESC NULLS LAST, harvesting_date DESC NULLS LAST`, [req.params.id]);
  res.json({ records: rows });
}));

// ---------------- irrigation & fertilizer logs ----------------
const irrSchema = z.object({
  duration: z.coerce.number().int().min(1).max(1440),
  waterAmount: z.coerce.number().positive(),
  method: z.enum(['Flood', 'Drip', 'Sprinkler']).optional(),
  timestamp: z.coerce.date().optional(),
  notes: z.string().max(255).optional(),
});
const fertSchema = z.object({
  type: z.enum(['Urea', 'DAP', 'MOP', 'NPK', 'Organic', 'Zinc Sulphate']),
  amount: z.coerce.number().positive().max(10000),
  timestamp: z.coerce.date().optional(),
  notes: z.string().max(255).optional(),
});
const range = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });

// GET /api/fields/:id/irrigation-logs
r.get('/:id/irrigation-logs', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const { limit } = range.parse(req.query);
  const { rows } = await query(`SELECT * FROM irrigation_logs WHERE field_id = $1 ORDER BY "timestamp" DESC LIMIT $2`, [req.params.id, limit]);
  res.json({ logs: rows });
}));

// POST /api/fields/:id/irrigation-logs
r.post('/:id/irrigation-logs', ah(async (req, res) => {
  const field = await ownedField(req.params.id, req.user.farmerId);
  const d = irrSchema.parse(req.body);
  const { rows: [log] } = await query(
    `INSERT INTO irrigation_logs (field_id, "timestamp", duration, water_amount, method, notes)
     VALUES ($1, COALESCE($2, now()), $3, $4, $5, $6) RETURNING *`,
    [field.field_id, d.timestamp ?? null, d.duration, d.waterAmount, d.method ?? field.irrigation_method, d.notes ?? null]);
  res.status(201).json({ log });
}));

// GET /api/fields/:id/fertilizer-logs
r.get('/:id/fertilizer-logs', ah(async (req, res) => {
  await ownedField(req.params.id, req.user.farmerId);
  const { limit } = range.parse(req.query);
  const { rows } = await query(`SELECT * FROM fertilizer_logs WHERE field_id = $1 ORDER BY "timestamp" DESC LIMIT $2`, [req.params.id, limit]);
  res.json({ logs: rows });
}));

// POST /api/fields/:id/fertilizer-logs
r.post('/:id/fertilizer-logs', ah(async (req, res) => {
  const field = await ownedField(req.params.id, req.user.farmerId);
  const d = fertSchema.parse(req.body);
  const { rows: [log] } = await query(
    `INSERT INTO fertilizer_logs (field_id, "timestamp", type, amount, notes) VALUES ($1, COALESCE($2, now()), $3, $4, $5) RETURNING *`,
    [field.field_id, d.timestamp ?? null, d.type, d.amount, d.notes ?? null]);
  res.status(201).json({ log });
}));

export default r;
