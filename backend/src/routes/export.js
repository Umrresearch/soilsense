import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { ah, ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ownedField } from '../lib/ownership.js';
import { sendMail, mailEnabled } from '../services/mailer.js';

const r = Router();
r.use(requireAuth);

const csvCell = (v) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');

const rangeSchema = z.object({
  fieldId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// GET /api/export/readings.csv?fieldId&from&to
r.get('/readings.csv', ah(async (req, res) => {
  const q = rangeSchema.parse(req.query);
  if (q.fieldId) await ownedField(q.fieldId, req.user.farmerId);
  const { rows } = await query(
    `SELECT f.field_id, f.field_name, s.sensor_id, s.sensor_type, s.unit, r."timestamp", r.value, r.status
       FROM sensor_readings r JOIN sensors s USING (sensor_id) JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND ($2::text IS NULL OR f.field_id = $2)
        AND r."timestamp" >= COALESCE($3::timestamptz, now() - interval '30 days')
        AND r."timestamp" <= COALESCE($4::timestamptz, now())
      ORDER BY f.field_id, s.sensor_type, r."timestamp"`,
    [req.user.farmerId, q.fieldId ?? null, q.from ?? null, q.to ?? null]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="sensor-readings-${q.fieldId ?? 'all'}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + toCsv(['field_id', 'field_name', 'sensor_id', 'sensor_type', 'unit', 'timestamp', 'value', 'status'], rows));
}));

// GET /api/export/logs.csv — irrigation + fertilizer history
r.get('/logs.csv', ah(async (req, res) => {
  const q = rangeSchema.parse(req.query);
  if (q.fieldId) await ownedField(q.fieldId, req.user.farmerId);
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'IRRIGATION' AS kind, l.field_id, f.field_name, l."timestamp", l.method AS detail, l.water_amount AS quantity, 'litres' AS unit, l.duration AS duration_min, l.notes
         FROM irrigation_logs l JOIN fields f USING (field_id) WHERE f.farmer_id = $1
       UNION ALL
       SELECT 'FERTILIZER', l.field_id, f.field_name, l."timestamp", l.type, l.amount, 'kg', NULL, l.notes
         FROM fertilizer_logs l JOIN fields f USING (field_id) WHERE f.farmer_id = $1) x
     WHERE ($2::text IS NULL OR field_id = $2)
       AND "timestamp" >= COALESCE($3::timestamptz, now() - interval '365 days') AND "timestamp" <= COALESCE($4::timestamptz, now())
     ORDER BY "timestamp" DESC`, [req.user.farmerId, q.fieldId ?? null, q.from ?? null, q.to ?? null]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="farm-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + toCsv(['kind', 'field_id', 'field_name', 'timestamp', 'detail', 'quantity', 'unit', 'duration_min', 'notes'], rows));
}));

/** Build a one-page farm report as a PDF Buffer. */
async function buildReport(farmerId) {
  const { rows: [farmer] } = await query('SELECT * FROM farmers WHERE farmer_id = $1', [farmerId]);
  const { rows: fields } = await query(
    `SELECT f.field_id, f.field_name, f.area_acres, f.soil_type,
            (SELECT last_reading FROM sensors s WHERE s.field_id = f.field_id AND sensor_type = 'SOIL_MOISTURE' LIMIT 1) AS moisture,
            (SELECT last_reading FROM sensors s WHERE s.field_id = f.field_id AND sensor_type = 'TEMPERATURE' LIMIT 1) AS temperature,
            (SELECT last_reading FROM sensors s WHERE s.field_id = f.field_id AND sensor_type = 'HUMIDITY' LIMIT 1) AS humidity,
            (SELECT COALESCE(sum(water_amount),0) FROM irrigation_logs l WHERE l.field_id = f.field_id AND l."timestamp" > now() - interval '30 days') AS water_30d
       FROM fields f WHERE f.farmer_id = $1 ORDER BY f.field_id`, [farmerId]);
  const { rows: recs } = await query(
    `SELECT r.priority, r.action, f.field_name FROM recommendations r JOIN fields f USING (field_id)
      WHERE f.farmer_id = $1 AND r.status = 'PENDING'
      ORDER BY CASE r.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END LIMIT 15`, [farmerId]);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));

  const EMERALD = '#047857';
  doc.rect(0, 0, doc.page.width, 80).fill('#062E22');
  doc.fill('#ECFDF5').fontSize(20).text('Smart Farm Advisory — Farm Report', 48, 26);
  doc.fontSize(10).fill('#A7F3D0').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`, 48, 52);
  doc.moveDown(3).fill('#111').fontSize(12)
    .text(`${farmer.name}  ·  ${farmer.farmer_id}`, 48, 100)
    .fontSize(10).fill('#444').text(`${farmer.farm_location}  ·  ${farmer.phone}`);

  doc.moveDown(1.2).fontSize(13).fill(EMERALD).text('Fields — latest readings');
  doc.moveDown(0.4).fontSize(9).fill('#222');
  const cols = [48, 140, 210, 270, 345, 420, 490];
  const header = ['Field', 'Area (ac)', 'Soil', 'Moisture %', 'Temp °C', 'Humidity %', 'Water 30d (kL)'];
  let y = doc.y;
  header.forEach((h, i) => doc.font('Helvetica-Bold').text(h, cols[i], y, { width: 75 }));
  y += 16;
  doc.font('Helvetica');
  for (const f of fields) {
    const row = [f.field_name, f.area_acres, f.soil_type, f.moisture ?? '—', f.temperature ?? '—', f.humidity ?? '—', Math.round(f.water_30d / 1000)];
    row.forEach((v, i) => doc.text(String(v), cols[i], y, { width: 75 }));
    y += 14;
    if (y > 700) { doc.addPage(); y = 60; }
  }

  doc.y = y + 10;
  doc.x = 48;
  doc.fontSize(13).fill(EMERALD).text('Pending recommendations');
  doc.moveDown(0.4).fontSize(10).fill('#222');
  if (!recs.length) doc.text('No pending recommendations.');
  for (const rc of recs) doc.text(`[${rc.priority}] ${rc.field_name}: ${rc.action}`, { indent: 4 }).moveDown(0.2);

  doc.moveDown(1).fontSize(8).fill('#777')
    .text('Recommendations are generated from sensor thresholds and your latest soil test. Confirm fertilizer doses with your local Krishi Vigyan Kendra.');
  doc.end();
  return { pdf: await done, farmer };
}

// GET /api/export/report.pdf
r.get('/report.pdf', ah(async (req, res) => {
  const { pdf } = await buildReport(req.user.farmerId);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="farm-report-${req.user.farmerId}-${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.send(pdf);
}));

// POST /api/export/email — e-mail the PDF report to the farmer
r.post('/email', ah(async (req, res) => {
  if (!mailEnabled()) throw new ApiError(501, 'EMAIL_NOT_CONFIGURED', 'E-mail delivery is not configured on this server (set SMTP_* variables)');
  const { pdf, farmer } = await buildReport(req.user.farmerId);
  await sendMail(farmer.email, 'Your Smart Farm report', `Namaste ${farmer.name},\n\nYour farm report is attached.\n`,
    [{ filename: 'farm-report.pdf', content: pdf }]);
  res.json({ message: `Report sent to ${farmer.email}` });
}));

export default r;
