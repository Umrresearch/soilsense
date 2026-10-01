# REST API Reference

Base URL: `http://localhost:4000` locally, or your Render URL in production. All bodies are JSON.

**48 endpoints** in 11 groups. Every one of them is exercised by `backend/test/api.test.js` (19 test cases, all passing).

## Conventions

| | |
|---|---|
| **Auth** | `Authorization: Bearer <JWT>` from `/api/auth/login` or `/register`. JWT lifetime: 1 day, or 30 days with `remember: true`. Logout revokes the token server-side. |
| **Device auth** | `POST /api/readings` also accepts `X-Device-Key: <INGEST_API_KEY>` for IoT gateways. |
| **IDs** | `FRM-0001` farmers · `FLD-0001` fields · `SNS-00001` sensors · numeric `rec_id`, `log_id`, `reading_id` |
| **Ownership** | Resources that belong to another farmer return **404** (not 403), so IDs can't be probed. `/farmers/:id` and `/dashboard/:id` return **403** for anyone but yourself. |
| **Timestamps** | ISO-8601 UTC (`2026-10-01T06:30:00.000Z`) |
| **Rate limits** | 300 req/min/IP overall. 20 per 15 min on login, register, forgot and reset password. |

### Error format (all endpoints)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid",
             "details": [{ "field": "phone", "message": "Enter a valid 10-digit Indian mobile number" }] } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod schema failed (`details[]` per field) |
| 400 | `CONSTRAINT_VIOLATION` | A DB CHECK failed (e.g. threshold order, negative area) |
| 400 | `INVALID_REFERENCE` / `INVALID_JSON` | Bad foreign key / malformed body |
| 401 | `UNAUTHORIZED` | Missing, invalid, expired or revoked token; wrong password; bad device key |
| 403 | `FORBIDDEN` / `CORS_BLOCKED` | Another farmer's profile or dashboard / origin not allowed |
| 404 | `NOT_FOUND` | Unknown route or resource (or not yours) |
| 409 | `CONFLICT` | Duplicate e-mail or phone, recommendation already applied or dismissed |
| 429 | `RATE_LIMITED` | Too many requests |
| 501 | `EMAIL_NOT_CONFIGURED` | `/export/email` without SMTP settings |
| 503 | `WEATHER_UNAVAILABLE` | Open-Meteo unreachable |
| 500 | `INTERNAL_ERROR` | Unexpected (details hidden in production) |

---

## 1. Authentication — `/api/auth`

| # | Method & path | Auth | Purpose |
|---|---|---|---|
| 1 | `POST /api/auth/register` | N | Create a farmer, auto-generate the Farmer ID, auto-login |
| 2 | `POST /api/auth/login` | N | Log in with e-mail, phone **or** Farmer ID |
| 3 | `POST /api/auth/logout` | Y | Revoke the current token |
| 4 | `GET /api/auth/profile` | Y | Current farmer + field count + total area |
| 5 | `PUT /api/auth/profile` | Y | Update own profile |
| 6 | `PUT /api/auth/password` | Y | Change password |
| 7 | `POST /api/auth/verify-email` | N / Y | Verify with a token, or `{resend:true}` (auth) to resend |
| 8 | `POST /api/auth/forgot-password` | N | E-mail a reset link (valid 1 h) |
| 9 | `POST /api/auth/reset-password` | N | Set a new password with the token |

**1 · register** — request:
```json
{ "name": "Ramesh Kumar", "email": "ramesh@example.in", "phone": "9876543210",
  "password": "Ganna2026", "confirmPassword": "Ganna2026",
  "village": "Laksar", "district": "Haridwar", "state": "Uttarakhand",
  "age": 42, "gender": "Male", "preferredLang": "hi", "acceptTerms": true }
```
Rules: password ≥ 8 characters with a letter and a digit. Phone is an Indian mobile (a `+91` prefix is stripped). `acceptTerms` must be `true`.
`201`:
```json
{ "message": "Registration successful. Your Farmer ID is FRM-0052.",
  "farmer": { "farmer_id": "FRM-0052", "name": "Ramesh Kumar", "email": "ramesh@example.in", "phone": "9876543210",
              "village": "Laksar", "district": "Haridwar", "state": "Uttarakhand",
              "farm_location": "Laksar, Haridwar, Uttarakhand", "email_verified": false, "created_at": "…" },
  "token": "eyJhbGciOi…", "expiresAt": "2026-10-31T…Z" }
```
The farmer row and default `thresholds` row are written in one transaction (trigger). Errors: `400`, `409` (e-mail or phone taken). In non-production the response also includes `devVerificationToken`.

**2 · login** — `{ "identifier": "FRM-0051" | "demo@soilsense.in" | "9000000051", "password": "…", "remember": true }` → `200 { farmer, token, expiresAt }` · `401 Incorrect login details` (same message whether or not the account exists).

**3 · logout** → `200 { "message": "Logged out" }`. The token's `jti` is stored as REVOKED until it expires.

**4 · profile** → `200 { "farmer": { …, "field_count": 3, "total_area_acres": 7.5 } }`

**5 · PUT profile** — any of `name, email, phone, village, district, state, age, gender, preferredLang` (unknown keys → 400). Changing the e-mail resets `email_verified`. → `200 { farmer }`

**6 · password** — `{ "currentPassword": "…", "newPassword": "…" }` → `200` · `401` wrong current password.

**7 · verify-email** — `{ "token": "<64 hex>" }` → `200 { message, farmer_id }` · `400` invalid or expired. Or, with auth, `{ "resend": true }` → `200`.

**8 · forgot-password** — `{ "email": "…" }` → always `200 { message }` (no account enumeration).

**9 · reset-password** — `{ "token": "<64 hex>", "password": "…" }` → `200` · `400`. Tokens are single-use and stored as SHA-256.

---

## 2. Farmers — `/api/farmers` (auth, self only)

| # | Endpoint | Response |
|---|---|---|
| 10 | `GET /api/farmers/:id` | `{ farmer }` |
| 11 | `PUT /api/farmers/:id` | Same body as PUT profile → `{ farmer }` |
| 12 | `GET /api/farmers/:id/fields` | `{ fields: [FieldSummary] }` |

**FieldSummary** (also used by dashboard):
```json
{ "field_id": "FLD-0131", "farmer_id": "FRM-0051", "field_name": "North Plot", "khasra_no": 9001,
  "area_acres": 2.5, "soil_type": "Alluvial", "soil_ph": 7.2, "soil_ec": 1.1, "ownership_type": "Owned",
  "irrigation_method": "Flood", "pump_flow_lph": 50000, "latitude": 29.95, "longitude": 78.05,
  "soil_moisture": 19.2, "soil_moisture_at": "…", "temperature": 32.5, "temperature_at": "…",
  "humidity": 68.2, "humidity_at": "…", "sensor_count": 3, "sensors_unhealthy": 0,
  "pending_recommendations": 2, "top_priority_rank": 2 }
```

## 3. Fields — `/api/fields` (auth)

| # | Endpoint | Request | Response |
|---|---|---|---|
| 13 | `POST /api/fields` | `{ fieldName*, areaAcres*, soilType*, khasraNo, soilPh, soilEc, ownershipType, irrigationMethod, pumpFlowLph, village, latitude, longitude, createDefaultSensors=true }` | `201 { field, sensors[3] }` (one transaction) |
| 14 | `GET /api/fields/:id` | — | `{ field: FieldSummary, latestSoilTest }` |
| 15 | `PUT /api/fields/:id` | any subset of the POST fields | `{ field }` |
| 16 | `DELETE /api/fields/:id` | — | `204` (cascades to sensors, readings, recommendations, logs) |
| 17 | `GET /api/fields/:id/sensors` | — | `{ sensors: [{ sensor_id, sensor_type, unit, sensor_location, is_active, last_reading, last_reading_at, health: ONLINE\|STALE\|NO_DATA\|INACTIVE, missing_pct_24h }] }` |
| 18 | `GET /api/fields/:id/crop-records` | — | `{ records: [CropRecord] }` (historical seasons from the spreadsheet) |
| 19 | `GET /api/fields/:id/irrigation-logs?limit=50` | — | `{ logs: [{ log_id, rec_id, timestamp, duration, water_amount, method, notes }] }` |
| 20 | `POST /api/fields/:id/irrigation-logs` | `{ duration* (1–1440 min), waterAmount* (L), method, timestamp, notes }` | `201 { log }` |
| 21 | `GET /api/fields/:id/fertilizer-logs?limit=50` | — | `{ logs: [{ log_id, rec_id, timestamp, type, amount, notes }] }` |
| 22 | `POST /api/fields/:id/fertilizer-logs` | `{ type* (Urea\|DAP\|MOP\|NPK\|Organic\|Zinc Sulphate), amount* (kg), timestamp, notes }` | `201 { log }` |

`soilType` ∈ Alluvial, Loamy, Clay, Sandy, Black, Red, Laterite · `irrigationMethod` ∈ Flood, Drip, Sprinkler.

## 4. Sensors — `/api/sensors` (auth)

| # | Endpoint | Request | Response |
|---|---|---|---|
| 23 | `POST /api/sensors` | `{ fieldId*, sensorType* (SOIL_MOISTURE\|TEMPERATURE\|HUMIDITY), sensorLocation, generateDeviceKey }` | `201 { sensor, deviceKey? }` (the key is shown once) |
| 24 | `GET /api/sensors/:id` | — | `{ sensor }` incl. `health`, `field_name` |
| 25 | `PUT /api/sensors/:id` | `{ sensorLocation?, isActive? }` | `{ sensor }` |
| 26 | `DELETE /api/sensors/:id` | — | `204` |
| 27 | `GET /api/sensors/:id/readings?from&to&limit=500&includeMissing=true` | — | `{ sensor_id, sensor_type, unit, readings: [{ reading_id, value, timestamp, status }] }` (default window 7 days) |

## 5. Sensor readings — `/api/readings`

| # | Endpoint | Auth |
|---|---|---|
| 28 | `POST /api/readings` | JWT **or** `X-Device-Key` |
| 29 | `GET /api/readings/:sensorId/latest?limit=100` | Y |
| 30 | `GET /api/readings/:sensorId/analytics?period=day\|week\|month` | Y |

**28 · batch upload** (1–1000 readings; a bare array is also accepted):
```json
{ "readings": [
  { "sensor_id": "SNS-00391", "value": 21.4, "timestamp": "2026-10-01T06:00:00Z" },
  { "sensor_id": "SNS-00392", "value": null },                 // → stored as MISSING
  { "sensor_id": "SNS-00393", "value": 140 },                  // out of range → MISSING
  { "sensor_id": "SNS-00391", "status": "MISSING", "timestamp": "2026-10-01T05:00:00Z" } ] }
```
`201`:
```json
{ "accepted": 4, "stored_as_missing": 3, "rejected": [], "fields_evaluated": 1, "recommendations_created": 1 }
```
- Plausible ranges: moisture 0–100 %, temperature −20–60 °C, humidity 0–100 %. Anything else becomes `MISSING`.
- `rejected[]` lists unknown, inactive, other-farmer or future-timestamp entries `{ index, sensor_id, reason }`. If every entry is rejected → `400`.
- Re-sending the same `(sensor_id, timestamp)` overwrites, so uploads are idempotent.
- After commit: the engine re-evaluates affected fields and SSE events are pushed.

**29 · latest** → `{ sensor_id, sensor_type, unit, readings: [ … newest first ] }`

**30 · analytics** → buckets of 1 h (day), 6 h (week) or 1 day (month):
```json
{ "sensor_id": "SNS-00391", "sensor_type": "SOIL_MOISTURE", "unit": "%", "period": "week", "bucket": "6 hours",
  "summary": { "avg": 27.7, "min": 19.2, "max": 35, "stddev": 4.1, "total": 84, "missing": 1,
               "missing_pct": 1.2, "trend_per_day": -0.95, "trend": "falling" },
  "series": [{ "bucket": "…", "avg": 30.1, "min": 29.6, "max": 30.4, "good": 3, "missing": 0 }] }
```

## 6. Recommendations — `/api/recommendations` (auth)

| # | Endpoint | Purpose |
|---|---|---|
| 31 | `GET /api/recommendations?status=PENDING\|APPLIED\|DISMISSED\|EXPIRED\|ALL&type=&fieldId=&limit=100` | All of the farmer's fields; PENDING sorted by priority |
| 32 | `GET /api/recommendations/:fieldId?refresh=true` | `{ field_id, field_name, current[], history[], inputs? }`. `refresh` re-runs the engine first and returns the engine inputs |
| 33 | `POST /api/recommendations/evaluate` | Re-run the engine for all fields → `{ evaluated, created, expired }` |
| 34 | `POST /api/recommendations/:id/apply` | `{ duration?, waterAmount?, amount?, notes? }` → `{ recommendation, log, logType }` |
| 35 | `POST /api/recommendations/:id/dismiss` | `{ reason? }` → `{ recommendation }` |

**Recommendation object:**
```json
{ "rec_id": 812, "field_id": "FLD-0131", "field_name": "North Plot", "type": "IRRIGATION",
  "priority": "MEDIUM", "rule_code": "IRR_LOW", "status": "PENDING", "applied": false,
  "action": "Irrigate today: about 973 kL (19 h 27 min of pumping) in 2 sessions",
  "explanation": "Soil moisture is 19.2%, below your irrigation threshold of 22%. Bringing the 450 mm root zone back to the 32% target needs about 57.6 mm of water; with flood irrigation (≈60% efficient) on 2.5 acres that is 973 kL.",
  "details": { "inputs": { "soil_moisture": 19.2, "temperature": 32.5, "humidity": 68.2 },
               "thresholds": { "low": 22, "critical": 15, "target": 32 },
               "plan": { "deficit_pct": 12.8, "net_depth_mm": 57.6, "efficiency": 0.6, "water_litres": 971246, "duration_min": 1165, "split_sessions": 2 },
               "confidence": "high" },
  "timestamp": "…", "resolved_at": null }
```
**Apply** runs in one ACID transaction: `SELECT … FOR UPDATE` → check PENDING → insert into `irrigation_logs` (IRRIGATION) or `fertilizer_logs` (FERTILIZER) with `rec_id` → status APPLIED. A second apply → `409`.

**Rule codes:** `IRR_CRITICAL`, `IRR_LOW`, `IRR_FORECAST`, `IRR_WATERLOGGING`, `HEAT_STRESS`, `COLD_STRESS`, `DISEASE_RISK`, `FERT_N_LOW`, `FERT_P_LOW`, `FERT_K_LOW`, `SENSOR_SOIL_MOISTURE`, `SENSOR_TEMPERATURE`, `SENSOR_HUMIDITY`.

## 7. Dashboard — `/api/dashboard/:farmerId` (auth, self only)

| # | Endpoint | Response |
|---|---|---|
| 36 | `GET …/summary` | `{ totals{fields,total_area_acres}, sensors{total,online,stale,no_data,inactive,avg_soil_moisture,avg_temperature,avg_humidity,last_update}, pending{total,byType,byPriority}, water{litres_7d,sessions_7d}, fertilizer{kg_30d,applications_30d}, fields:[FieldSummary sorted by urgency] }` |
| 37 | `GET …/alerts` | `{ alerts:[CRITICAL/HIGH or ALERT recs], sensorIssues:[STALE/NO_DATA sensors], count }` |
| 38 | `GET …/analytics?period=week\|month\|quarter` | `{ daily[{day,sensor_type,avg,min,max,missing_pct}], water[{day,field_id,litres,minutes}], fertilizer[{type,kg,applications}], yields[{year,yield_q_per_acre,district_avg,records}], prediction{year,yield_q_per_acre,range[2],trend_q_per_year,method}\|null, fields[comparison], recommendations[{type,status,n}] }` |

## 8. Thresholds — `/api/thresholds` (auth)

| # | Endpoint | |
|---|---|---|
| 39 | `GET /api/thresholds` | `{ thresholds }` |
| 40 | `PUT /api/thresholds` | Any of `moisture_critical, moisture_low, moisture_target, moisture_high, temp_high, temp_low, humidity_high, humidity_low, nitrogen_min, phosphorus_min, potassium_min, root_zone_mm` → `{ thresholds, reevaluatedFields }`. Order is enforced by DB CHECKs (e.g. low < target) → `400 CONSTRAINT_VIOLATION` |
| 41 | `POST /api/thresholds/reset` | Restore sugarcane defaults |

Defaults: moisture 15 / 22 / 32 / 40 %, temperature 10–38 °C, humidity 35–85 %, N 100 / P 35 / K 70 kg/acre, root zone 450 mm.

## 9. Weather — 42 · `GET /api/weather/:fieldId` (auth)
Open-Meteo current conditions plus a 3-day forecast at the field's coordinates, cached 30 min. Includes `advice` when ≥ 20 mm of rain is expected. `503` if unreachable.

## 10. Export — `/api/export` (auth)

| # | Endpoint | Output |
|---|---|---|
| 43 | `GET /api/export/readings.csv?fieldId&from&to` | CSV (UTF-8 BOM, opens in Excel). Default last 30 days |
| 44 | `GET /api/export/logs.csv?fieldId&from&to` | Irrigation + fertilizer history CSV |
| 45 | `GET /api/export/report.pdf` | One-page farm report (fields, latest readings, water 30 d, pending advice) |
| 46 | `POST /api/export/email` | E-mails the PDF to the farmer (requires SMTP) |

## 11. System

| # | Endpoint | |
|---|---|---|
| 47 | `GET /api/health` | `{ status, db, dbLatencyMs, time }` (for hosting health checks and keep-alive pings) |
| 48 | `GET /api/stream?token=<JWT>` | Server-Sent Events: `hello`, `reading {sensor_id, field_id, sensor_type, value, status, timestamp}`, `recommendations {field_id, created, expired}`. Heartbeat every 25 s |

---

## Testing with curl / Postman

```bash
API=http://localhost:4000
TOKEN=$(curl -s $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"demo@soilsense.in","password":"Demo@1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s $API/api/dashboard/FRM-0051/summary -H "Authorization: Bearer $TOKEN" | head -c 400
curl -s "$API/api/recommendations?status=PENDING" -H "Authorization: Bearer $TOKEN"
curl -s -X POST $API/api/readings -H "X-Device-Key: $INGEST_API_KEY" -H 'Content-Type: application/json' \
  -d '{"readings":[{"sensor_id":"SNS-00397","value":14.2}]}'
curl -s -N "$API/api/stream?token=$TOKEN"     # watch live events
```
