import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { ah, conflict } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ownedField, ownedRecommendation } from '../lib/ownership.js';
import { evaluateField } from '../services/engine.js';

const r = Router();
r.use(requireAuth);

const PRIORITY_ORDER = `CASE r.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`;

// GET /api/recommendations?status=PENDING&type=IRRIGATION&limit=50 — all of the farmer's fields
r.get('/', ah(async (req, res) => {
  const q = z.object({
    status: z.enum(['PENDING', 'APPLIED', 'DISMISSED', 'EXPIRED', 'ALL']).default('PENDING'),
    type: z.enum(['IRRIGATION', 'FERTILIZER', 'ALERT']).optional(),
    fieldId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }).parse(req.query);
  const { rows } = await query(
    `SELECT r.*, f.field_name FROM recommendations r JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND ($2 = 'ALL' OR r.status = $2) AND ($3::text IS NULL OR r.type = $3)
        AND ($4::text IS NULL OR r.field_id = $4)
      ORDER BY ${q.status === 'PENDING' ? `${PRIORITY_ORDER},` : ''} r."timestamp" DESC LIMIT $5`,
    [req.user.farmerId, q.status, q.type ?? null, q.fieldId ?? null, q.limit]);
  res.json({ recommendations: rows });
}));

// GET /api/recommendations/:fieldId?refresh=true — current + history for one field
r.get('/:fieldId', ah(async (req, res, next) => {
  if (/^\d+$/.test(req.params.fieldId)) return next(); // numeric → /:id/... routes below
  const field = await ownedField(req.params.fieldId, req.user.farmerId);
  let evaluation = null;
  if (req.query.refresh === 'true') evaluation = await evaluateField(field.field_id);
  const { rows: current } = await query(
    `SELECT r.* FROM recommendations r WHERE r.field_id = $1 AND r.status = 'PENDING' ORDER BY ${PRIORITY_ORDER}, r."timestamp" DESC`, [field.field_id]);
  const { rows: history } = await query(
    `SELECT r.* FROM recommendations r WHERE r.field_id = $1 AND r.status <> 'PENDING' ORDER BY r."timestamp" DESC LIMIT 50`, [field.field_id]);
  res.json({ field_id: field.field_id, field_name: field.field_name, current, history, ...(evaluation ? { inputs: evaluation.inputs } : {}) });
}));

// POST /api/recommendations/evaluate — re-run the engine for all of the farmer's fields
r.post('/evaluate', ah(async (req, res) => {
  const { rows } = await query('SELECT field_id FROM fields WHERE farmer_id = $1', [req.user.farmerId]);
  const results = [];
  for (const f of rows) results.push(await evaluateField(f.field_id));
  res.json({ evaluated: results.length, created: results.reduce((a, x) => a + x.created, 0), expired: results.reduce((a, x) => a + x.expired, 0) });
}));

/**
 * POST /api/recommendations/:id/apply
 * Atomically: lock the recommendation → mark APPLIED → write the matching irrigation / fertilizer log.
 * Body (all optional, defaults come from the recommendation): { duration, waterAmount, amount, fertilizerType, notes }
 */
r.post('/:id/apply', ah(async (req, res) => {
  const d = z.object({
    duration: z.coerce.number().int().min(1).max(1440).optional(),
    waterAmount: z.coerce.number().positive().optional(),
    amount: z.coerce.number().positive().max(10000).optional(),
    notes: z.string().max(255).optional(),
  }).parse(req.body ?? {});
  const id = z.coerce.number().int().positive().parse(req.params.id);

  const result = await tx(async (c) => {
    const rec = await ownedRecommendation(id, req.user.farmerId, c, true);
    if (rec.status !== 'PENDING') throw conflict(`Recommendation is already ${rec.status.toLowerCase()}`);
    let log = null;
    if (rec.type === 'IRRIGATION') {
      const plan = rec.details.plan ?? {};
      ({ rows: [log] } = await c.query(
        `INSERT INTO irrigation_logs (field_id, rec_id, duration, water_amount, method, notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [rec.field_id, rec.rec_id, d.duration ?? Math.min(1440, plan.duration_min ?? 60), d.waterAmount ?? plan.water_litres ?? 1,
          rec.irrigation_method, d.notes ?? 'Applied from recommendation']));
    } else if (rec.type === 'FERTILIZER') {
      ({ rows: [log] } = await c.query(
        `INSERT INTO fertilizer_logs (field_id, rec_id, type, amount, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [rec.field_id, rec.rec_id, rec.details.product, d.amount ?? rec.details.amount_kg, d.notes ?? 'Applied from recommendation']));
    }
    const { rows: [updated] } = await c.query(
      `UPDATE recommendations SET status = 'APPLIED', resolved_at = now() WHERE rec_id = $1 RETURNING *`, [rec.rec_id]);
    return { recommendation: updated, log, logType: rec.type === 'IRRIGATION' ? 'irrigation' : rec.type === 'FERTILIZER' ? 'fertilizer' : null };
  });
  res.json(result);
}));

// POST /api/recommendations/:id/dismiss  { reason? }
r.post('/:id/dismiss', ah(async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(200).optional() }).parse(req.body ?? {});
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const updated = await tx(async (c) => {
    const rec = await ownedRecommendation(id, req.user.farmerId, c, true);
    if (rec.status !== 'PENDING') throw conflict(`Recommendation is already ${rec.status.toLowerCase()}`);
    const { rows: [u] } = await c.query(
      `UPDATE recommendations SET status = 'DISMISSED', resolved_at = now(),
              details = details || jsonb_build_object('dismiss_reason', $2::text)
        WHERE rec_id = $1 RETURNING *`, [rec.rec_id, reason ?? null]);
    return u;
  });
  res.json({ recommendation: updated });
}));

export default r;
