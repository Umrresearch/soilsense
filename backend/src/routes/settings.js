import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ah, badRequest } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { evaluateField } from '../services/engine.js';

const r = Router();
r.use(requireAuth);

const KEYS = ['moisture_critical', 'moisture_low', 'moisture_target', 'moisture_high', 'temp_high', 'temp_low',
  'humidity_high', 'humidity_low', 'nitrogen_min', 'phosphorus_min', 'potassium_min', 'root_zone_mm'];

// GET /api/thresholds
r.get('/', ah(async (req, res) => {
  const { rows: [t] } = await query('SELECT * FROM thresholds WHERE farmer_id = $1', [req.user.farmerId]);
  res.json({ thresholds: t });
}));

// PUT /api/thresholds — partial update; ordering rules are enforced by DB CHECK constraints
r.put('/', ah(async (req, res) => {
  const d = z.object(Object.fromEntries(KEYS.map((k) => [k, z.coerce.number().min(0).max(2000).optional()]))).strict().parse(req.body);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest('No thresholds to update');
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const { rows: [t] } = await query(
    `UPDATE thresholds SET ${sets.join(', ')} WHERE farmer_id = $${entries.length + 1} RETURNING *`,
    [...entries.map(([, v]) => v), req.user.farmerId]);
  // thresholds changed → refresh recommendations for all fields
  const { rows: fields } = await query('SELECT field_id FROM fields WHERE farmer_id = $1', [req.user.farmerId]);
  for (const f of fields) await evaluateField(f.field_id);
  res.json({ thresholds: t, reevaluatedFields: fields.length });
}));

// POST /api/thresholds/reset
r.post('/reset', ah(async (req, res) => {
  await query('DELETE FROM thresholds WHERE farmer_id = $1', [req.user.farmerId]);
  const { rows: [t] } = await query('INSERT INTO thresholds (farmer_id) VALUES ($1) RETURNING *', [req.user.farmerId]);
  res.json({ thresholds: t });
}));

export default r;
