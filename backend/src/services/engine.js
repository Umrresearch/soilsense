/**
 * Threshold-based recommendation engine
 * =====================================
 * Input  : latest sensor readings for a field (soil moisture, temperature, humidity),
 *          the farmer's thresholds, the field's latest soil test (crop_records)
 *          and recent irrigation / fertilizer logs.
 * Output : a set of recommendations, each with a plain-language explanation.
 *
 * Missing-data strategy (per sensor type):
 *   1. Use the newest GOOD reading if it is ≤ FRESH_HOURS old.
 *   2. If the newest rows are MISSING but a GOOD reading exists within that window,
 *      carry it forward and mark the input "carried-forward" (lower confidence).
 *   3. If nothing GOOD exists within the window, the input is UNAVAILABLE:
 *      rules that depend on it are skipped and a SENSOR_* alert is raised instead.
 *
 * The engine is idempotent: it upserts one PENDING recommendation per (field, rule)
 * and expires PENDING recommendations whose rule no longer fires.
 */
import { pool } from '../db.js';

export const FRESH_HOURS = 6;
const IRRIGATION_COOLDOWN_H = 12;
const FERTILIZER_COOLDOWN_D = 21;
const M2_PER_ACRE = 4046.86;
const EFFICIENCY = { Flood: 0.6, Sprinkler: 0.75, Drip: 0.9 };

// Nutrient → fertilizer product, nutrient fraction, max per-acre single dose (kg product)
const NUTRIENTS = {
  N: { label: 'Nitrogen',   col: 'nitrogen_kg_acre',   min: 'nitrogen_min',   product: 'Urea', fraction: 0.46, capPerAcre: 65,
       why: 'Nitrogen drives tillering and cane elongation.' },
  P: { label: 'Phosphorus', col: 'phosphorus_kg_acre', min: 'phosphorus_min', product: 'DAP',  fraction: 0.46, capPerAcre: 50,
       why: 'Phosphorus supports root development and early tiller strength.' },
  K: { label: 'Potassium',  col: 'potassium_kg_acre',  min: 'potassium_min',  product: 'MOP',  fraction: 0.60, capPerAcre: 40,
       why: 'Potassium improves sucrose accumulation (Brix) and drought tolerance.' },
};

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Linear-regression slope (units per hour) over [{t: Date, v: number}] */
function slopePerHour(points) {
  if (points.length < 4) return null;
  const t0 = points[0].t.getTime();
  const xs = points.map((p) => (p.t.getTime() - t0) / 3.6e6);
  const ys = points.map((p) => p.v);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : num / den;
}

/** Build the engine's view of one sensor type for a field. */
function summariseSensor(sensor, rows, now) {
  // rows: newest first, last 24h
  const good = rows.filter((r) => r.status === 'GOOD');
  const latestGood = good[0];
  const missingStreak = rows.findIndex((r) => r.status === 'GOOD');
  const ageH = latestGood ? (now - latestGood.timestamp) / 3.6e6 : Infinity;
  let quality = 'UNAVAILABLE';
  if (latestGood && ageH <= FRESH_HOURS) quality = missingStreak > 0 ? 'CARRIED_FORWARD' : 'OK';
  const pts = good.slice().reverse().map((r) => ({ t: r.timestamp, v: r.value }));
  return {
    sensorId: sensor?.sensor_id ?? null,
    value: quality === 'UNAVAILABLE' ? null : latestGood.value,
    readingAt: latestGood?.timestamp ?? null,
    ageHours: Number.isFinite(ageH) ? round(ageH, 1) : null,
    missingStreak: missingStreak === -1 ? rows.length : missingStreak,
    missingPct24h: rows.length ? round((100 * (rows.length - good.length)) / rows.length, 0) : 100,
    trendPerHour: round(slopePerHour(pts), 3),
    quality,
  };
}

async function loadContext(client, fieldId) {
  const now = new Date();
  const { rows: [field] } = await client.query(
    `SELECT f.*, t.* FROM fields f JOIN thresholds t USING (farmer_id) WHERE f.field_id = $1`, [fieldId]);
  if (!field) return null;

  const { rows: sensors } = await client.query(
    `SELECT sensor_id, sensor_type FROM sensors WHERE field_id = $1 AND is_active ORDER BY sensor_id`, [fieldId]);
  const { rows: readings } = await client.query(
    `SELECT r.sensor_id, r.value, r."timestamp", r.status
       FROM sensor_readings r
      WHERE r.sensor_id = ANY($1) AND r."timestamp" > now() - interval '24 hours'
      ORDER BY r."timestamp" DESC`, [sensors.map((s) => s.sensor_id)]);

  const inputs = {};
  for (const type of ['SOIL_MOISTURE', 'TEMPERATURE', 'HUMIDITY']) {
    const s = sensors.find((x) => x.sensor_type === type);
    inputs[type] = s
      ? summariseSensor(s, readings.filter((r) => r.sensor_id === s.sensor_id), now)
      : { sensorId: null, value: null, quality: 'NO_SENSOR' };
  }

  const { rows: [soil] } = await client.query(
    `SELECT record_id, season_year, nitrogen_kg_acre, phosphorus_kg_acre, potassium_kg_acre, soil_ph, growth_stage
       FROM crop_records
      WHERE field_id = $1 AND (nitrogen_kg_acre IS NOT NULL OR phosphorus_kg_acre IS NOT NULL OR potassium_kg_acre IS NOT NULL)
      ORDER BY season_year DESC NULLS LAST, harvesting_date DESC NULLS LAST LIMIT 1`, [fieldId]);

  const { rows: [lastIrr] } = await client.query(
    `SELECT "timestamp" FROM irrigation_logs WHERE field_id = $1 ORDER BY "timestamp" DESC LIMIT 1`, [fieldId]);
  const { rows: fertRecent } = await client.query(
    `SELECT DISTINCT type FROM fertilizer_logs
      WHERE field_id = $1 AND "timestamp" > now() - make_interval(days => $2)`, [fieldId, FERTILIZER_COOLDOWN_D]);

  return { now, field, inputs, soil, lastIrr: lastIrr?.timestamp ?? null, fertRecent: new Set(fertRecent.map((r) => r.type)) };
}

/** Compute irrigation quantity for raising soil moisture from `current` to `target` (% vol). */
export function irrigationPlan(field, current, target) {
  const deficitPct = Math.max(0, target - current);
  const netMm = (deficitPct / 100) * field.root_zone_mm;          // mm of water over the field
  const areaM2 = field.area_acres * M2_PER_ACRE;
  const eff = EFFICIENCY[field.irrigation_method] ?? 0.6;
  const litres = (netMm * areaM2) / eff;                             // 1 mm on 1 m² = 1 L
  const minutes = Math.min(1440, Math.max(1, Math.round((litres / field.pump_flow_lph) * 60)));
  return {
    deficit_pct: round(deficitPct, 1),
    net_depth_mm: round(netMm, 1),
    efficiency: eff,
    water_litres: Math.round(litres),
    duration_min: minutes,
    split_sessions: minutes > 720 ? Math.ceil(minutes / 720) : 1,
  };
}

const fmtL = (l) => (l >= 1e5 ? `${round(l / 1000, 0).toLocaleString('en-IN')} kL` : `${Math.round(l).toLocaleString('en-IN')} L`);
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

/** Pure rule evaluation → array of candidate recommendations. */
export function evaluate(ctx) {
  const { field: f, inputs, soil, now, lastIrr, fertRecent } = ctx;
  const out = [];
  const M = inputs.SOIL_MOISTURE, T = inputs.TEMPERATURE, H = inputs.HUMIDITY;
  const confidence = (i) => (i.quality === 'OK' ? 'high' : 'reduced');
  const dataNote = (i, label) => i.quality === 'CARRIED_FORWARD'
    ? ` Note: the latest ${i.missingStreak} ${label} reading(s) were missing, so the last good value from ${i.ageHours} h ago was used.`
    : '';

  // ------------------------------------------------ sensor health
  for (const [type, inp, label] of [['SOIL_MOISTURE', M, 'soil-moisture'], ['TEMPERATURE', T, 'temperature'], ['HUMIDITY', H, 'humidity']]) {
    if (inp.quality === 'UNAVAILABLE') {
      out.push({
        type: 'ALERT', rule_code: `SENSOR_${type}`, priority: type === 'SOIL_MOISTURE' ? 'HIGH' : 'MEDIUM',
        action: `Check the ${label} sensor (${inp.sensorId}) — no valid data for ${inp.ageHours ? `${inp.ageHours} h` : 'over 24 h'}`,
        explanation: `No good ${label} reading has arrived in the last ${FRESH_HOURS} hours (${inp.missingPct24h}% of readings in the last 24 h were missing). ` +
          (type === 'SOIL_MOISTURE'
            ? 'Irrigation advice for this field is paused until the sensor reports again — check the battery, cable and that the probe is still in the soil.'
            : 'Advice that depends on this sensor is paused. Check the battery and the sensor housing.'),
        details: { sensor_id: inp.sensorId, last_good_at: inp.readingAt, missing_pct_24h: inp.missingPct24h },
      });
    }
  }

  // ------------------------------------------------ irrigation
  const irrigatedRecently = lastIrr && (now - lastIrr) / 3.6e6 < IRRIGATION_COOLDOWN_H;
  if (M.value != null && !irrigatedRecently) {
    const m = M.value;
    const hot = T.value != null && T.value >= f.temp_high;
    if (m < f.moisture_low) {
      const plan = irrigationPlan(f, m, f.moisture_target);
      const critical = m < f.moisture_critical;
      out.push({
        type: 'IRRIGATION', rule_code: critical ? 'IRR_CRITICAL' : 'IRR_LOW',
        priority: critical ? 'CRITICAL' : hot ? 'HIGH' : 'MEDIUM',
        action: `${critical ? 'Irrigate now' : 'Irrigate today'}: about ${fmtL(plan.water_litres)} (${fmtDur(plan.duration_min)} of pumping)` +
          (plan.split_sessions > 1 ? ` in ${plan.split_sessions} sessions` : ''),
        explanation:
          `Soil moisture is ${round(m)}%, below your ${critical ? `critical level of ${f.moisture_critical}%` : `irrigation threshold of ${f.moisture_low}%`}. ` +
          `Bringing the ${f.root_zone_mm} mm root zone back to the ${f.moisture_target}% target needs about ${plan.net_depth_mm} mm of water; ` +
          `with ${f.irrigation_method.toLowerCase()} irrigation (≈${Math.round(plan.efficiency * 100)}% efficient) on ${f.area_acres} acres that is ${fmtL(plan.water_litres)}.` +
          (hot ? ` It is also hot (${round(T.value)}°C), so the crop is losing water quickly — irrigate in the early morning or evening.` : '') +
          dataNote(M, 'soil-moisture'),
        details: { inputs: { soil_moisture: m, temperature: T.value, humidity: H.value }, thresholds: { low: f.moisture_low, critical: f.moisture_critical, target: f.moisture_target }, plan, confidence: confidence(M) },
      });
    } else if (m > f.moisture_high) {
      out.push({
        type: 'ALERT', rule_code: 'IRR_WATERLOGGING', priority: 'MEDIUM',
        action: 'Stop irrigation and open drainage channels',
        explanation: `Soil moisture is ${round(m)}%, above the ${f.moisture_high}% upper limit. Waterlogged sugarcane roots get too little oxygen, which slows growth and raises the risk of root rot. Skip the next irrigation and clear field drains.` + dataNote(M, 'soil-moisture'),
        details: { inputs: { soil_moisture: m }, thresholds: { high: f.moisture_high }, confidence: confidence(M) },
      });
    } else if (M.trendPerHour != null && M.trendPerHour < 0) {
      const hoursToLow = (m - f.moisture_low) / -M.trendPerHour;
      if (hoursToLow <= 24) {
        const plan = irrigationPlan(f, f.moisture_low, f.moisture_target);
        out.push({
          type: 'IRRIGATION', rule_code: 'IRR_FORECAST', priority: 'LOW',
          action: `Plan irrigation within ~${Math.max(1, Math.round(hoursToLow))} h (≈${fmtL(plan.water_litres)})`,
          explanation: `Soil moisture is ${round(m)}% and falling about ${round(-M.trendPerHour * 24, 1)}% per day. At this rate it will reach your ${f.moisture_low}% threshold in roughly ${Math.round(hoursToLow)} hours, so schedule water and labour now.`,
          details: { inputs: { soil_moisture: m, trend_per_hour: M.trendPerHour }, hours_to_threshold: round(hoursToLow, 1), plan, confidence: confidence(M) },
        });
      }
    }
  }

  // ------------------------------------------------ weather / disease alerts
  if (T.value != null && T.value >= f.temp_high) {
    out.push({
      type: 'ALERT', rule_code: 'HEAT_STRESS', priority: T.value >= f.temp_high + 4 ? 'HIGH' : 'MEDIUM',
      action: 'Heat stress: keep soil moist and avoid fertilizer application today',
      explanation: `Canopy temperature is ${round(T.value)}°C, above your ${f.temp_high}°C limit. Sugarcane growth slows above ~38°C and fertilizer applied to hot, dry soil is easily lost. Prefer light irrigation in the evening; consider trash mulching to cool the soil.` + dataNote(T, 'temperature'),
      details: { inputs: { temperature: T.value }, thresholds: { high: f.temp_high }, confidence: confidence(T) },
    });
  }
  if (T.value != null && T.value <= f.temp_low) {
    out.push({
      type: 'ALERT', rule_code: 'COLD_STRESS', priority: 'MEDIUM',
      action: 'Cold spell: give a light irrigation in the evening to protect against frost',
      explanation: `Temperature is ${round(T.value)}°C, below your ${f.temp_low}°C limit. Moist soil holds heat overnight, which reduces frost damage to young shoots and ratoon buds.` + dataNote(T, 'temperature'),
      details: { inputs: { temperature: T.value }, thresholds: { low: f.temp_low }, confidence: confidence(T) },
    });
  }
  if (H.value != null && H.value >= f.humidity_high && (T.value == null || (T.value >= 20 && T.value <= 34))) {
    out.push({
      type: 'ALERT', rule_code: 'DISEASE_RISK', priority: 'MEDIUM',
      action: 'High disease risk: scout for red rot and smut; avoid evening irrigation',
      explanation: `Humidity is ${round(H.value)}%${T.value != null ? ` at ${round(T.value)}°C` : ''} — warm, humid conditions favour fungal diseases such as red rot and smut, which are common in Haridwar cane fields. Inspect leaves and split a few canes; remove and burn infected clumps.` + dataNote(H, 'humidity'),
      details: { inputs: { humidity: H.value, temperature: T.value }, thresholds: { humidity_high: f.humidity_high }, confidence: confidence(H) },
    });
  }

  // ------------------------------------------------ fertilizer (latest soil test)
  if (soil) {
    const hot = T.value != null && T.value >= f.temp_high;
    for (const [key, n] of Object.entries(NUTRIENTS)) {
      const level = soil[n.col];
      const minimum = f[n.min];
      if (level == null || level >= minimum || fertRecent.has(n.product)) continue;
      const nutrientNeeded = (minimum - level) * f.area_acres;                       // kg nutrient for field
      const productKg = Math.min(nutrientNeeded / n.fraction, n.capPerAcre * f.area_acres);
      const fullDose = nutrientNeeded / n.fraction;
      const split = fullDose > productKg + 0.5;
      out.push({
        type: 'FERTILIZER', rule_code: `FERT_${key}_LOW`,
        priority: level < minimum * 0.7 ? 'HIGH' : 'MEDIUM',
        action: `Apply ${Math.round(productKg)} kg ${n.product} on ${f.field_name}${split ? ' (first split dose)' : ''}`,
        explanation:
          `The latest soil test (${soil.season_year ?? 'most recent season'}) shows ${n.label.toLowerCase()} at ${round(level)} kg/acre, below your ${minimum} kg/acre minimum. ${n.why} ` +
          `Closing the gap on ${f.area_acres} acres needs ≈${Math.round(fullDose)} kg ${n.product}` +
          (split ? `; apply at most ${n.capPerAcre} kg/acre at a time, so give ${Math.round(productKg)} kg now and the rest after 3–4 weeks.` : '.') +
          ' Apply on moist soil (after irrigation) and incorporate near the cane rows.' +
          (hot ? ' Wait until the current heat spell eases.' : '') +
          ' Confirm with your local Krishi Vigyan Kendra if your crop stage differs.',
        details: { soil_test: { record_id: soil.record_id, season_year: soil.season_year, level_kg_acre: level }, threshold: minimum, product: n.product, amount_kg: Math.round(productKg), full_requirement_kg: Math.round(fullDose), split },
      });
    }
  }
  return out;
}

/**
 * Evaluate one field and persist results.
 * Returns { created, updated, expired, pending: [...] }.
 */
export async function evaluateField(fieldId, client = null) {
  const own = !client;
  const c = client ?? (await pool.connect());
  try {
    if (own) await c.query('BEGIN');
    const ctx = await loadContext(c, fieldId);
    if (!ctx) { if (own) await c.query('ROLLBACK'); return null; }
    const candidates = evaluate(ctx);

    let created = 0, updated = 0;
    for (const r of candidates) {
      const { rows: [row] } = await c.query(
        `INSERT INTO recommendations (field_id, type, priority, action, explanation, details, rule_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (field_id, rule_code) WHERE status = 'PENDING'
         DO UPDATE SET priority = EXCLUDED.priority, action = EXCLUDED.action,
                       explanation = EXCLUDED.explanation, details = EXCLUDED.details
         RETURNING (xmax = 0) AS inserted`,
        [fieldId, r.type, r.priority, r.action, r.explanation, JSON.stringify(r.details), r.rule_code]);
      row.inserted ? created++ : updated++;
    }
    const firing = candidates.map((r) => r.rule_code);
    const { rowCount: expired } = await c.query(
      `UPDATE recommendations SET status = 'EXPIRED', resolved_at = now()
        WHERE field_id = $1 AND status = 'PENDING' AND NOT (rule_code = ANY($2))`, [fieldId, firing]);

    if (own) await c.query('COMMIT');
    return { field_id: fieldId, created, updated, expired, inputs: ctx.inputs };
  } catch (e) {
    if (own) await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    if (own) c.release();
  }
}
