/**
 * Seed the database from backend/seed-data/*.json (generated from the spreadsheet by
 * database/import_xlsx.py) and synthesise realistic sensor data.
 *
 *   npm run db:seed                 → 14 days of readings every 2 h (default)
 *   SEED_DAYS=30 SEED_STEP_H=1 npm run db:seed
 *
 * What gets created
 *   • 50 farmers + 130 fields + 3,000 crop records from the spreadsheet (passwords pre-hashed)
 *   • 1 demo farmer (demo@smartfarm.in / Demo@1234) with 3 fields
 *   • 3 sensors per field (soil moisture, temperature, humidity)
 *   • readings with diurnal cycles, drying curves, irrigation events, ~2.5 % random gaps
 *     and a few sensors with ongoing outages (to exercise missing-data handling)
 *   • irrigation & fertilizer logs, applied/dismissed historical recommendations
 *   • current PENDING recommendations from the live engine
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { evaluateField, irrigationPlan } from '../src/services/engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (n) => JSON.parse(fs.readFileSync(path.join(here, '../seed-data', `${n}.json`), 'utf8'));

const DAYS = Number(process.env.SEED_DAYS || 14);
const STEP_H = Number(process.env.SEED_STEP_H || 2);

// Deterministic PRNG so every seed produces the same dataset
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261001);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

async function insertMany(client, table, cols, rows, chunk = 1000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((row, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`);
    part.forEach((row) => cols.forEach((c) => params.push(row[c] ?? null)));
    await client.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${values.join(',')}`, params);
  }
}

async function main() {
  const t0 = Date.now();
  const farmers = load('farmers');
  const fields = load('fields');
  const crops = load('crop_records');

  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM farmers');
  if (n > 0 && !process.argv.includes('--force')) {
    console.log(`Database already has ${n} farmers. Run "npm run db:reset" to rebuild from scratch.`);
    return;
  }

  // ---------- demo account (so testers don't need the spreadsheet passwords)
  const demo = {
    farmer_id: 'FRM-0051', name: 'Demo Farmer', email: 'demo@smartfarm.in', phone: '9000000051',
    password_hash: bcrypt.hashSync('Demo@1234', 10), age: 40, gender: 'Male',
    village: 'Bahadrabad', district: 'Haridwar', state: 'Uttarakhand', created_at: new Date().toISOString(),
  };
  farmers.push(demo);
  const demoFields = [
    { name: 'North Plot', area: 2.5, soil: 'Alluvial', irr: 'Flood',     base: { moisture: 19, temp: 30, humidity: 72 }, n: 95,  p: 60, k: 80 },
    { name: 'Canal Side', area: 1.8, soil: 'Loamy',    irr: 'Drip',      base: { moisture: 27, temp: 29, humidity: 86 }, n: 160, p: 28, k: 120 },
    { name: 'Well Plot',  area: 3.2, soil: 'Sandy',    irr: 'Sprinkler', base: { moisture: 24, temp: 31, humidity: 64 }, n: 135, p: 70, k: 58 },
  ].map((d, i) => ({
    field_id: `FLD-${String(131 + i).padStart(4, '0')}`, farmer_id: demo.farmer_id, field_name: d.name,
    khasra_no: 9001 + i, area_acres: d.area, soil_type: d.soil, soil_ph: 7.2, soil_ec: 1.1, ownership_type: 'Owned',
    irrigation_method: d.irr, village: 'Bahadrabad', latitude: 29.95 + i * 0.01, longitude: 78.05 + i * 0.01,
    _baseline: d.base, _npk: d,
  }));
  fields.push(...demoFields);
  // eight seasons of history per demo field (2017–2024, matching the spreadsheet years);
  // the 2024 record is the "latest soil test" the fertilizer rules read
  let dn = 1;
  demoFields.forEach((f, i) => {
    for (let y = 2017; y <= 2024; y++) {
      const latest = y === 2024;
      crops.push({
        record_id: `REC-D${String(dn++).padStart(4, '0')}`, field_id: f.field_id, season_year: y, season: y % 2 ? 'Kharif' : 'Rabi',
        variety: ['CoJ64', 'Co0238', 'Co98014'][y % 3], growth_stage: 'Late',
        nitrogen_kg_acre: latest ? f._npk.n : 110 + ((y * 7 + i * 13) % 60),
        phosphorus_kg_acre: latest ? f._npk.p : 40 + ((y * 5 + i * 11) % 40),
        potassium_kg_acre: latest ? f._npk.k : 75 + ((y * 3 + i * 17) % 60),
        soil_ph: 7.2, soil_moisture_pct: f._baseline.moisture,
        yield_q_per_acre: Math.round(255 + i * 15 + (y - 2017) * 6 + ((y * 37 + i * 11) % 40) - 20),
        brix_value: 18 + ((y + i) % 5) * 0.6,
      });
    }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // thresholds are created by trigger on farmer insert
    await insertMany(client, 'farmers',
      ['farmer_id', 'name', 'email', 'phone', 'password_hash', 'age', 'gender', 'village', 'district', 'state', 'created_at'], farmers);
    console.log(`✓ ${farmers.length} farmers`);

    const PUMP = { Flood: 50000, Sprinkler: 30000, Drip: 15000 };
    fields.forEach((f) => { f.pump_flow_lph = PUMP[f.irrigation_method] ?? 40000; });
    await insertMany(client, 'fields',
      ['field_id', 'farmer_id', 'field_name', 'khasra_no', 'area_acres', 'soil_type', 'soil_ph', 'soil_ec',
        'ownership_type', 'irrigation_method', 'pump_flow_lph', 'village', 'latitude', 'longitude'], fields);
    console.log(`✓ ${fields.length} fields`);

    await insertMany(client, 'crop_records',
      ['record_id', 'field_id', 'season_year', 'season', 'variety', 'planting_date', 'harvesting_date', 'growth_stage',
        'yield_q_per_acre', 'temperature_avg', 'humidity', 'rainfall_total_mm', 'soil_moisture_pct', 'soil_ph', 'soil_ec',
        'nitrogen_kg_acre', 'phosphorus_kg_acre', 'potassium_kg_acre', 'fertilizer_type', 'fertilizer_qty',
        'irrigation_method', 'water_l_per_acre', 'disease_type', 'disease_severity', 'pest_level', 'brix_value'], crops, 500);
    console.log(`✓ ${crops.length} crop records`);

    // ---------- sensors
    const sensors = [];
    let sn = 1;
    const LOC = { SOIL_MOISTURE: 'Root zone, 30 cm deep', TEMPERATURE: 'Canopy, 1.5 m', HUMIDITY: 'Canopy, 1.5 m' };
    for (const f of fields) {
      for (const type of ['SOIL_MOISTURE', 'TEMPERATURE', 'HUMIDITY']) {
        sensors.push({ sensor_id: `SNS-${String(sn++).padStart(5, '0')}`, field_id: f.field_id, sensor_type: type, sensor_location: LOC[type], _field: f });
      }
    }
    await insertMany(client, 'sensors', ['sensor_id', 'field_id', 'sensor_type', 'sensor_location'], sensors);
    console.log(`✓ ${sensors.length} sensors`);

    // ---------- synthesise readings, irrigation logs, historical recommendations
    await client.query('ALTER TABLE sensor_readings DISABLE TRIGGER trg_readings_sync');
    const { rows: thr } = await client.query('SELECT * FROM thresholds');
    const thrBy = Object.fromEntries(thr.map((t) => [t.farmer_id, t]));

    const now = new Date();
    now.setMinutes(0, 0, 0);
    const steps = Math.floor((DAYS * 24) / STEP_H);
    const start = new Date(now.getTime() - steps * STEP_H * 3.6e6);
    const readings = [];
    const irrLogs = [];
    const fertLogs = [];
    const histRecs = [];

    // pick a few sensors with an ongoing outage (exercise SENSOR_* alerts)
    const outage = new Set(sensors.filter(() => rand() < 0.015).map((s) => s.sensor_id));
    // demo account: humidity sensor of "Well Plot" offline for the last 9 h
    outage.add(sensors.find((s) => s.field_id === demoFields[2].field_id && s.sensor_type === 'HUMIDITY').sensor_id);

    for (const f of fields) {
      const t = thrBy[f.farmer_id];
      const base = f._baseline;
      const fSensors = sensors.filter((s) => s.field_id === f.field_id);
      // soil-moisture state machine
      let m = clamp(base.moisture + gauss() * 3, t.moisture_low + 2, t.moisture_high - 3);
      const dryRate = 0.08 + rand() * 0.12;                        // % per hour
      const isDemoDry = f.field_id === demoFields[0].field_id;
      // ~40% of fields are allowed to end the window "thirsty" (no irrigation in the last ~2 days)
      const lateSkipH = isDemoDry || rand() < 0.4 ? 30 + rand() * 40 : 0;
      for (let i = 0; i <= steps; i++) {
        const ts = new Date(start.getTime() + i * STEP_H * 3.6e6);
        const hod = ts.getUTCHours() + 5.5;                          // IST hour of day
        const diurnal = Math.sin(((hod - 9) / 24) * 2 * Math.PI);    // peak ~15:00 IST
        const temp = base.temp - 2 + 6 * diurnal + gauss() * 0.8 + (f.field_id === demoFields[2].field_id ? 6 : 0);
        const hum = clamp(base.humidity + 4 - 12 * diurnal + gauss() * 2.5, 20, 99);
        // drying is faster when hot
        m -= STEP_H * dryRate * (1 + Math.max(0, temp - 30) / 15);
        m += gauss() * 0.15;
        const hoursLeft = (steps - i) * STEP_H;
        if (m < t.moisture_low + rand() * 3 && hoursLeft > lateSkipH) {
          // irrigation event (+ the recommendation that prompted it, mostly applied)
          const plan = irrigationPlan({ ...f, ...t, root_zone_mm: t.root_zone_mm }, m, t.moisture_target);
          const recTs = new Date(ts.getTime() - 3 * 3.6e6);
          const accepted = rand() < 0.85;
          histRecs.push({
            field_id: f.field_id, type: 'IRRIGATION', priority: m < t.moisture_critical ? 'CRITICAL' : 'MEDIUM',
            action: `Irrigate: about ${Math.round(plan.water_litres / 1000)} kL (${Math.floor(plan.duration_min / 60)} h ${plan.duration_min % 60} min of pumping)`,
            explanation: `Soil moisture was ${r2(m)}%, below the ${t.moisture_low}% threshold.`,
            details: JSON.stringify({ inputs: { soil_moisture: r2(m) }, plan }), rule_code: 'IRR_LOW',
            status: accepted ? 'APPLIED' : 'DISMISSED', timestamp: recTs, resolved_at: ts, _plan: plan,
          });
          irrLogs.push({ field_id: f.field_id, timestamp: ts, duration: plan.duration_min, water_amount: plan.water_litres,
            method: f.irrigation_method, notes: accepted ? 'Applied from recommendation' : 'Irrigated on own schedule', _rec: histRecs.length - 1, _accepted: accepted });
          m = t.moisture_target + rand() * 4;
        }
        m = clamp(m, 8, 48);
        const vals = { SOIL_MOISTURE: m, TEMPERATURE: temp, HUMIDITY: hum };
        for (const s of fSensors) {
          const inOutage = outage.has(s.sensor_id) && hoursLeft < (s.field_id === demoFields[2].field_id ? 9 : 10 + rand() * 20);
          const missing = inOutage || rand() < 0.025;
          readings.push({ sensor_id: s.sensor_id, value: missing ? null : r2(vals[s.sensor_type]), timestamp: ts, status: missing ? 'MISSING' : 'GOOD' });
        }
      }
      // a fertilizer application ~3–6 weeks ago for half the fields (history for analytics)
      if (rand() < 0.5) {
        const type = ['Urea', 'DAP', 'MOP', 'Organic'][Math.floor(rand() * 4)];
        fertLogs.push({ field_id: f.field_id, timestamp: new Date(now.getTime() - (22 + rand() * 20) * 864e5), type,
          amount: r2((type === 'Organic' ? 400 : 50) * f.area_acres * (0.8 + rand() * 0.4)), notes: 'Basal / top dressing' });
      }
    }

    // insert readings in big unnest() batches (fast on remote DBs)
    for (let i = 0; i < readings.length; i += 10000) {
      const part = readings.slice(i, i + 10000);
      await client.query(
        `INSERT INTO sensor_readings (sensor_id, value, "timestamp", status)
         SELECT * FROM unnest($1::varchar[], $2::numeric[], $3::timestamptz[], $4::varchar[])`,
        [part.map((r) => r.sensor_id), part.map((r) => r.value), part.map((r) => r.timestamp), part.map((r) => r.status)]);
    }
    await client.query('ALTER TABLE sensor_readings ENABLE TRIGGER trg_readings_sync');
    await client.query(`
      UPDATE sensors s SET last_reading = x.value, last_reading_at = x."timestamp"
        FROM (SELECT DISTINCT ON (sensor_id) sensor_id, value, "timestamp"
                FROM sensor_readings WHERE status = 'GOOD'
               ORDER BY sensor_id, "timestamp" DESC) x
       WHERE s.sensor_id = x.sensor_id`);
    console.log(`✓ ${readings.length.toLocaleString()} sensor readings (${readings.filter((r) => r.status === 'MISSING').length.toLocaleString()} MISSING)`);

    // historical recommendations → logs (linked by rec_id)
    for (const r of histRecs) {
      const { rows: [{ rec_id }] } = await client.query(
        `INSERT INTO recommendations (field_id, type, priority, action, explanation, details, rule_code, status, "timestamp", resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING rec_id`,
        [r.field_id, r.type, r.priority, r.action, r.explanation, r.details, r.rule_code, r.status, r.timestamp, r.resolved_at]);
      r.rec_id = rec_id;
    }
    irrLogs.forEach((l) => { l.rec_id = l._accepted ? histRecs[l._rec].rec_id : null; });
    await insertMany(client, 'irrigation_logs', ['field_id', 'rec_id', 'timestamp', 'duration', 'water_amount', 'method', 'notes'], irrLogs);
    await insertMany(client, 'fertilizer_logs', ['field_id', 'timestamp', 'type', 'amount', 'notes'], fertLogs);
    console.log(`✓ ${histRecs.length} historical recommendations, ${irrLogs.length} irrigation logs, ${fertLogs.length} fertilizer logs`);

    // keep sequences ahead of imported IDs so new registrations get FRM-0052, FLD-0134 …
    await client.query(`SELECT setval('farmer_id_seq', (SELECT max(substring(farmer_id from 5)::int) FROM farmers))`);
    await client.query(`SELECT setval('field_id_seq',  (SELECT max(substring(field_id  from 5)::int) FROM fields))`);
    await client.query(`SELECT setval('sensor_id_seq', (SELECT max(substring(sensor_id from 5)::int) FROM sensors))`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // ---------- run the live engine for every field → current PENDING recommendations
  let pending = 0;
  for (const f of fields) {
    const r = await evaluateField(f.field_id);
    pending += r.created;
  }
  console.log(`✓ engine produced ${pending} current recommendations`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s.  Demo login: demo@smartfarm.in / Demo@1234`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
