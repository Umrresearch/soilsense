/**
 * End-to-end API tests. Runs against the database in DATABASE_URL (seeded with `npm run db:reset`).
 *   npm test
 * Creates a throw-away farmer for write tests so seed data is left intact.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

process.env.NODE_ENV ??= 'test';
let server, base, token, demoToken, me, fieldId, sensorId, newSensorId;
const uniq = Date.now().toString().slice(-8);

async function api(method, path, { body, auth = token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : ct.includes('pdf') ? await res.arrayBuffer() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (me) await pool.query('DELETE FROM farmers WHERE farmer_id = $1', [me]);
  server.close();
  await pool.end();
});

test('health', async () => {
  const r = await api('GET', '/api/health', { auth: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.db, 'ok');
});

test('register validates input', async () => {
  const r = await api('POST', '/api/auth/register', { auth: null, body: { name: 'X', email: 'bad', password: 'short' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'VALIDATION_ERROR');
  assert.ok(r.data.error.details.length >= 3);
});

test('register → auto Farmer ID, token, default thresholds', async () => {
  const r = await api('POST', '/api/auth/register', { auth: null, body: {
    name: 'Test Kisan', email: `kisan${uniq}@example.in`, phone: `98${uniq}`, password: 'Kheti2026',
    confirmPassword: 'Kheti2026', village: 'Roorkee', district: 'Haridwar', state: 'Uttarakhand', acceptTerms: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.farmer.farmer_id, /^FRM-\d{4}$/);
  assert.match(r.data.message, /Farmer ID is FRM-/);
  token = r.data.token; me = r.data.farmer.farmer_id;
  const t = await api('GET', '/api/thresholds');
  assert.equal(t.data.thresholds.moisture_low, 22);
  // verify e-mail with the dev token
  const v = await api('POST', '/api/auth/verify-email', { auth: null, body: { token: r.data.devVerificationToken } });
  assert.equal(v.status, 200);
});

test('duplicate e-mail → 409', async () => {
  const r = await api('POST', '/api/auth/register', { auth: null, body: {
    name: 'Dup', email: `kisan${uniq}@example.in`, phone: '9123456789', password: 'Kheti2026',
    confirmPassword: 'Kheti2026', village: 'A1', district: 'B1', state: 'C1', acceptTerms: true } });
  assert.equal(r.status, 409);
});

test('login with email, phone and Farmer ID', async () => {
  for (const identifier of ['demo@soilsense.in', '9000000051', 'frm-0051']) {
    const r = await api('POST', '/api/auth/login', { auth: null, body: { identifier, password: 'Demo@1234', remember: true } });
    assert.equal(r.status, 200, identifier);
    demoToken = r.data.token;
  }
  const bad = await api('POST', '/api/auth/login', { auth: null, body: { identifier: 'demo@soilsense.in', password: 'nope' } });
  assert.equal(bad.status, 401);
});

test('seeded spreadsheet farmer can log in with their original password', async () => {
  const r = await api('POST', '/api/auth/login', { auth: null, body: { identifier: 'rajendra.pundir@farmerconnect.in', password: 'S5k%LCh6kKUd' } });
  assert.equal(r.status, 200);
});

test('profile get/update + farmers/:id', async () => {
  let r = await api('GET', '/api/auth/profile');
  assert.equal(r.data.farmer.farmer_id, me);
  r = await api('PUT', '/api/auth/profile', { body: { village: 'Laksar', preferredLang: 'hi' } });
  assert.equal(r.data.farmer.farm_location, 'Laksar, Haridwar, Uttarakhand');
  r = await api('GET', `/api/farmers/${me}`);
  assert.equal(r.status, 200);
  r = await api('PUT', `/api/farmers/${me}`, { body: { age: 45 } });
  assert.equal(r.data.farmer.age, 45);
  r = await api('GET', '/api/farmers/FRM-0001');
  assert.equal(r.status, 403, 'cannot read another farmer');
});

test('fields: create (with sensors), read, update, list', async () => {
  let r = await api('POST', '/api/fields', { body: { fieldName: 'Test Plot', areaAcres: 1.5, soilType: 'Loamy', irrigationMethod: 'Drip' } });
  assert.equal(r.status, 201);
  fieldId = r.data.field.field_id;
  assert.equal(r.data.sensors.length, 3);
  sensorId = r.data.sensors.find((s) => s.sensor_type === 'SOIL_MOISTURE').sensor_id;
  r = await api('GET', `/api/fields/${fieldId}`);
  assert.equal(r.data.field.sensor_count, 3);
  r = await api('PUT', `/api/fields/${fieldId}`, { body: { areaAcres: 2 } });
  assert.equal(r.data.field.area_acres, 2);
  r = await api('GET', `/api/farmers/${me}/fields`);
  assert.equal(r.data.fields.length, 1);
  r = await api('GET', `/api/fields/${fieldId}/sensors`);
  assert.equal(r.data.sensors.length, 3);
  r = await api('GET', '/api/fields/FLD-0001');
  assert.equal(r.status, 404, 'other farmer field hidden');
  r = await api('POST', '/api/fields', { body: { fieldName: 'Bad', areaAcres: -1, soilType: 'Moon' } });
  assert.equal(r.status, 400);
});

test('sensors: create, get, update, readings', async () => {
  let r = await api('POST', '/api/sensors', { body: { fieldId, sensorType: 'SOIL_MOISTURE', sensorLocation: 'Edge', generateDeviceKey: true } });
  assert.equal(r.status, 201);
  assert.equal(r.data.deviceKey.length, 48);
  newSensorId = r.data.sensor.sensor_id;
  r = await api('GET', `/api/sensors/${newSensorId}`);
  assert.equal(r.data.sensor.health, 'NO_DATA');
  r = await api('PUT', `/api/sensors/${newSensorId}`, { body: { isActive: false } });
  assert.equal(r.data.sensor.is_active, false);
  r = await api('DELETE', `/api/sensors/${newSensorId}`);
  assert.equal(r.status, 204);
});

test('readings: batch upload with missing / out-of-range data → recommendations', async () => {
  const now = Date.now();
  const readings = [];
  for (let i = 12; i >= 1; i--) readings.push({ sensor_id: sensorId, value: 20 - i * 0.2, timestamp: new Date(now - i * 3600e3).toISOString() });
  readings.push({ sensor_id: sensorId, value: null, timestamp: new Date(now - 30 * 60e3).toISOString() });  // missing
  readings.push({ sensor_id: sensorId, value: 140, timestamp: new Date(now - 10 * 60e3).toISOString() });   // out of range
  readings.push({ sensor_id: 'SNS-99999', value: 20 });                                                      // unknown
  const r = await api('POST', '/api/readings', { body: { readings } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.accepted, 14);
  assert.equal(r.data.stored_as_missing, 2);
  assert.equal(r.data.rejected.length, 1);
  // idempotent re-upload
  const again = await api('POST', '/api/readings', { body: { readings: readings.slice(0, 3) } });
  assert.equal(again.status, 201);

  const latest = await api('GET', `/api/readings/${sensorId}/latest?limit=5`);
  assert.equal(latest.data.readings[0].status, 'MISSING');
  const an = await api('GET', `/api/readings/${sensorId}/analytics?period=day`);
  assert.ok(an.data.summary.missing >= 2);
  assert.ok(an.data.series.length > 0);
  const sr = await api('GET', `/api/sensors/${sensorId}/readings?limit=50`);
  assert.equal(sr.data.readings.length, 14);

  const recs = await api('GET', `/api/recommendations/${fieldId}?refresh=true`);
  const irr = recs.data.current.find((x) => x.type === 'IRRIGATION');
  assert.ok(irr, 'irrigation recommendation created');
  assert.match(irr.explanation, /missing/i, 'explains carried-forward value');
  assert.ok(irr.details.plan.water_litres > 0);
  // temperature & humidity sensors have no data → sensor alerts
  assert.ok(recs.data.current.some((x) => x.rule_code === 'SENSOR_TEMPERATURE'));
});

test('device key ingestion', async () => {
  const bad = await api('POST', '/api/readings', { auth: null, headers: { 'X-Device-Key': 'wrong' }, body: { readings: [{ sensor_id: sensorId, value: 20 }] } });
  assert.equal(bad.status, 401);
  if (process.env.INGEST_API_KEY) {
    const ok = await api('POST', '/api/readings', { auth: null, headers: { 'X-Device-Key': process.env.INGEST_API_KEY }, body: [{ sensor_id: sensorId, value: 19.5 }] });
    assert.equal(ok.status, 201);
  }
});

test('apply recommendation writes irrigation log atomically; second apply → 409', async () => {
  const list = await api('GET', `/api/recommendations?status=PENDING&fieldId=${fieldId}`);
  const irr = list.data.recommendations.find((x) => x.type === 'IRRIGATION');
  const r = await api('POST', `/api/recommendations/${irr.rec_id}/apply`, { body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.data.recommendation.applied, true);
  assert.equal(r.data.log.rec_id, irr.rec_id);
  const again = await api('POST', `/api/recommendations/${irr.rec_id}/apply`, { body: {} });
  assert.equal(again.status, 409);
  const logs = await api('GET', `/api/fields/${fieldId}/irrigation-logs`);
  assert.equal(logs.data.logs.length, 1);
});

test('dismiss recommendation + evaluate all', async () => {
  const list = await api('GET', '/api/recommendations?status=PENDING');
  const a = list.data.recommendations.find((x) => x.type === 'ALERT');
  const r = await api('POST', `/api/recommendations/${a.rec_id}/dismiss`, { body: { reason: 'Sensor being replaced' } });
  assert.equal(r.data.recommendation.status, 'DISMISSED');
  const e = await api('POST', '/api/recommendations/evaluate');
  assert.equal(e.data.evaluated, 1);
});

test('manual logs', async () => {
  let r = await api('POST', `/api/fields/${fieldId}/fertilizer-logs`, { body: { type: 'Urea', amount: 50 } });
  assert.equal(r.status, 201);
  r = await api('GET', `/api/fields/${fieldId}/fertilizer-logs`);
  assert.equal(r.data.logs.length, 1);
  r = await api('POST', `/api/fields/${fieldId}/irrigation-logs`, { body: { duration: 60, waterAmount: 15000 } });
  assert.equal(r.status, 201);
});

test('thresholds: update re-evaluates; invalid ordering rejected by DB CHECK', async () => {
  let r = await api('PUT', '/api/thresholds', { body: { moisture_low: 18 } });
  assert.equal(r.data.thresholds.moisture_low, 18);
  r = await api('PUT', '/api/thresholds', { body: { moisture_low: 50 } });  // > target → violates ck_moisture_order
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'CONSTRAINT_VIOLATION');
  r = await api('POST', '/api/thresholds/reset');
  assert.equal(r.data.thresholds.moisture_low, 22);
});

test('dashboard summary / alerts / analytics (demo farmer)', async () => {
  let r = await api('GET', '/api/dashboard/FRM-0051/summary', { auth: demoToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.fields, 3);
  assert.equal(r.data.sensors.total, 9);
  assert.ok(r.data.pending.total > 0);
  r = await api('GET', '/api/dashboard/FRM-0051/alerts', { auth: demoToken });
  assert.ok(Array.isArray(r.data.alerts) && Array.isArray(r.data.sensorIssues));
  assert.equal(r.data.count, r.data.alerts.length + r.data.sensorIssues.length);
  r = await api('GET', '/api/dashboard/FRM-0001/analytics?period=month', { auth: demoToken });
  assert.equal(r.status, 403);
  const login = await api('POST', '/api/auth/login', { auth: null, body: { identifier: 'rajendra.pundir@farmerconnect.in', password: 'S5k%LCh6kKUd' } });
  r = await api('GET', '/api/dashboard/FRM-0001/analytics?period=month', { auth: login.data.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.yields.length >= 3);
  assert.ok(r.data.prediction?.yield_q_per_acre > 0);
  assert.ok(r.data.daily.length > 0);
});

test('exports: CSV + PDF', async () => {
  let r = await api('GET', '/api/export/readings.csv', { auth: demoToken });
  assert.equal(r.status, 200);
  assert.match(r.data, /field_id,field_name,sensor_id/);
  r = await api('GET', '/api/export/logs.csv', { auth: demoToken });
  assert.equal(r.status, 200);
  r = await api('GET', '/api/export/report.pdf', { auth: demoToken });
  assert.equal(r.status, 200);
  assert.equal(new TextDecoder().decode(r.data.slice(0, 4)), '%PDF');
});

test('password change, forgot / reset, logout revokes token', async () => {
  let r = await api('PUT', '/api/auth/password', { body: { currentPassword: 'Kheti2026', newPassword: 'Kheti2027' } });
  assert.equal(r.status, 200);
  r = await api('POST', '/api/auth/forgot-password', { auth: null, body: { email: `kisan${uniq}@example.in` } });
  assert.ok(r.data.devResetToken);
  r = await api('POST', '/api/auth/reset-password', { auth: null, body: { token: r.data.devResetToken, password: 'Kheti2028' } });
  assert.equal(r.status, 200);
  r = await api('POST', '/api/auth/logout');
  assert.equal(r.status, 200);
  r = await api('GET', '/api/auth/profile');
  assert.equal(r.status, 401);
});

test('field delete cascades', async () => {
  const login = await api('POST', '/api/auth/login', { auth: null, body: { identifier: `kisan${uniq}@example.in`, password: 'Kheti2028' } });
  token = login.data.token;
  const r = await api('DELETE', `/api/fields/${fieldId}`);
  assert.equal(r.status, 204);
  const { rows } = await pool.query('SELECT count(*)::int n FROM sensors WHERE field_id = $1', [fieldId]);
  assert.equal(rows[0].n, 0);
});
