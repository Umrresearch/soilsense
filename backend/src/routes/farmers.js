import { Router } from 'express';
import { query } from '../db.js';
import { ah, notFound } from '../lib/errors.js';
import { requireAuth, requireSelf } from '../middleware/auth.js';
import { updateFarmer } from './auth.js';
import { fieldSummarySql } from './fields.js';

const r = Router();
r.use(requireAuth);

// GET /api/farmers/:id
r.get('/:id', requireSelf(), ah(async (req, res) => {
  const { rows: [f] } = await query(
    `SELECT farmer_id, name, email, phone, age, gender, village, district, state, farm_location,
            preferred_lang, email_verified, created_at, updated_at
       FROM farmers WHERE farmer_id = $1`, [req.params.id]);
  if (!f) throw notFound('Farmer');
  res.json({ farmer: f });
}));

// PUT /api/farmers/:id
r.put('/:id', requireSelf(), ah(async (req, res) => {
  res.json({ farmer: await updateFarmer(req.params.id, req.body) });
}));

// GET /api/farmers/:id/fields
r.get('/:id/fields', requireSelf(), ah(async (req, res) => {
  const { rows } = await query(`${fieldSummarySql} WHERE f.farmer_id = $1 ORDER BY f.field_id`, [req.params.id]);
  res.json({ fields: rows });
}));

export default r;
