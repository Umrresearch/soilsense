import { query } from '../db.js';
import { notFound } from './errors.js';

// Each helper 404s (rather than 403s) for records owned by someone else,
// so IDs belonging to other farmers cannot be probed.

export async function ownedField(fieldId, farmerId, client = { query }) {
  const { rows } = await client.query(
    `SELECT * FROM fields WHERE field_id = $1 AND farmer_id = $2`, [fieldId, farmerId]);
  if (!rows[0]) throw notFound('Field');
  return rows[0];
}

export async function ownedSensor(sensorId, farmerId, client = { query }) {
  const { rows } = await client.query(
    `SELECT s.*, f.farmer_id, f.field_name
       FROM sensors s JOIN fields f USING (field_id)
      WHERE s.sensor_id = $1 AND f.farmer_id = $2`, [sensorId, farmerId]);
  if (!rows[0]) throw notFound('Sensor');
  return rows[0];
}

export async function ownedRecommendation(recId, farmerId, client = { query }, lock = false) {
  const { rows } = await client.query(
    `SELECT r.*, f.area_acres, f.irrigation_method, f.pump_flow_lph
       FROM recommendations r JOIN fields f USING (field_id)
      WHERE r.rec_id = $1 AND f.farmer_id = $2 ${lock ? 'FOR UPDATE OF r' : ''}`, [recId, farmerId]);
  if (!rows[0]) throw notFound('Recommendation');
  return rows[0];
}
