import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ah, badRequest } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ownedField, ownedSensor } from '../lib/ownership.js';

const r = Router();
r.use(requireAuth);

const SENSOR_COLS = `sensor_id, field_id, sensor_type, unit, sensor_location, is_active, last_reading, last_reading_at, created_at, updated_at`;

// POST /api/sensors
r.post('/', ah(async (req, res) => {
  const d = z.object({
    fieldId: z.string(),
    sensorType: z.enum(['SOIL_MOISTURE', 'TEMPERATURE', 'HUMIDITY']),
    sensorLocation: z.string().trim().min(1).max(100).optional(),
    generateDeviceKey: z.boolean().optional(),
  }).parse(req.body);
  await ownedField(d.fieldId, req.user.farmerId);
  const deviceKey = d.generateDeviceKey ? crypto.randomBytes(24).toString('hex') : null;
  const { rows: [sensor] } = await query(
    `INSERT INTO sensors (field_id, sensor_type, sensor_location, device_key)
     VALUES ($1, $2, COALESCE($3, 'Field centre'), $4) RETURNING ${SENSOR_COLS}`,
    [d.fieldId, d.sensorType, d.sensorLocation ?? null, deviceKey]);
  // the device key is shown exactly once
  res.status(201).json({ sensor, ...(deviceKey ? { deviceKey } : {}) });
}));

// GET /api/sensors/:id
r.get('/:id', ah(async (req, res) => {
  await ownedSensor(req.params.id, req.user.farmerId);
  const { rows: [sensor] } = await query(
    `SELECT v.*, f.field_name FROM v_sensor_status v JOIN fields f USING (field_id) WHERE v.sensor_id = $1`, [req.params.id]);
  res.json({ sensor });
}));

// PUT /api/sensors/:id
r.put('/:id', ah(async (req, res) => {
  await ownedSensor(req.params.id, req.user.farmerId);
  const d = z.object({ sensorLocation: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional() }).strict().parse(req.body);
  if (d.sensorLocation === undefined && d.isActive === undefined) throw badRequest('No fields to update');
  const { rows: [sensor] } = await query(
    `UPDATE sensors SET sensor_location = COALESCE($1, sensor_location), is_active = COALESCE($2, is_active)
      WHERE sensor_id = $3 RETURNING ${SENSOR_COLS}`, [d.sensorLocation ?? null, d.isActive ?? null, req.params.id]);
  res.json({ sensor });
}));

// DELETE /api/sensors/:id
r.delete('/:id', ah(async (req, res) => {
  await ownedSensor(req.params.id, req.user.farmerId);
  await query('DELETE FROM sensors WHERE sensor_id = $1', [req.params.id]);
  res.status(204).end();
}));

// GET /api/sensors/:id/readings?from&to&limit&includeMissing
r.get('/:id/readings', ah(async (req, res) => {
  const sensor = await ownedSensor(req.params.id, req.user.farmerId);
  const q = z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(500),
    includeMissing: z.enum(['true', 'false']).default('true'),
  }).parse(req.query);
  const { rows } = await query(
    `SELECT reading_id, value, "timestamp", status FROM sensor_readings
      WHERE sensor_id = $1
        AND "timestamp" >= COALESCE($2::timestamptz, now() - interval '7 days')
        AND "timestamp" <= COALESCE($3::timestamptz, now())
        AND ($4 OR status = 'GOOD')
      ORDER BY "timestamp" DESC LIMIT $5`,
    [sensor.sensor_id, q.from ?? null, q.to ?? null, q.includeMissing === 'true', q.limit]);
  res.json({ sensor_id: sensor.sensor_id, sensor_type: sensor.sensor_type, unit: sensor.unit, readings: rows });
}));

export default r;
