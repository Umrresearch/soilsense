-- =====================================================================
--  Smart Sugarcane Farm Advisory System — PostgreSQL schema (3NF)
--  Target: PostgreSQL 15+ (Neon / Supabase / Render / local)
--
--  Core tables (from the project poster):
--    1. farmers            5. recommendations
--    2. fields             6. irrigation_logs
--    3. sensors            7. fertilizer_logs
--    4. sensor_readings
--  Supporting tables:
--    8. crop_records       (historical agronomy data imported from the spreadsheet)
--    9. thresholds         (per-farmer alert/recommendation thresholds)
--   10. auth_tokens        (email verification / password reset / revoked JWTs)
--
--  Every statement is idempotent-safe when run on an empty database.
--  Run:  psql "$DATABASE_URL" -f database/schema.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Human-readable ID generators  (FRM-0001, FLD-0001, SNS-00001)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS farmer_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS field_id_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS sensor_id_seq START 1;

-- Shared trigger: keep updated_at current
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. FARMERS
-- ---------------------------------------------------------------------
CREATE TABLE farmers (
  farmer_id       VARCHAR(12)  PRIMARY KEY
                  DEFAULT ('FRM-' || lpad(nextval('farmer_id_seq')::text, 4, '0')),
  name            VARCHAR(120) NOT NULL CHECK (length(trim(name)) >= 2),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(15)  NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),   -- Indian mobile
  password_hash   VARCHAR(100) NOT NULL,
  age             SMALLINT     CHECK (age BETWEEN 16 AND 110),
  gender          VARCHAR(10)  CHECK (gender IN ('Male','Female','Other')),
  village         VARCHAR(80)  NOT NULL,
  district        VARCHAR(80)  NOT NULL,
  state           VARCHAR(80)  NOT NULL,
  farm_location   VARCHAR(260) GENERATED ALWAYS AS (village || ', ' || district || ', ' || state) STORED,
  preferred_lang  VARCHAR(5)   NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en','hi')),
  email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_farmers_email ON farmers (lower(email));
CREATE UNIQUE INDEX ux_farmers_phone ON farmers (phone);
CREATE TRIGGER trg_farmers_touch BEFORE UPDATE ON farmers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. FIELDS
-- ---------------------------------------------------------------------
CREATE TABLE fields (
  field_id        VARCHAR(12)  PRIMARY KEY
                  DEFAULT ('FLD-' || lpad(nextval('field_id_seq')::text, 4, '0')),
  farmer_id       VARCHAR(12)  NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
  field_name      VARCHAR(100) NOT NULL,
  khasra_no       INTEGER      CHECK (khasra_no > 0),                       -- land-record plot no.
  area_acres      NUMERIC(7,2) NOT NULL CHECK (area_acres > 0 AND area_acres <= 1000),
  soil_type       VARCHAR(20)  NOT NULL CHECK (soil_type IN ('Alluvial','Loamy','Clay','Sandy','Black','Red','Laterite')),
  soil_ph         NUMERIC(4,2) CHECK (soil_ph BETWEEN 0 AND 14),
  soil_ec         NUMERIC(5,2) CHECK (soil_ec >= 0),                         -- dS/m
  ownership_type  VARCHAR(10)  NOT NULL DEFAULT 'Owned' CHECK (ownership_type IN ('Owned','Leased')),
  irrigation_method VARCHAR(12) NOT NULL DEFAULT 'Flood' CHECK (irrigation_method IN ('Flood','Drip','Sprinkler')),
  pump_flow_lph   INTEGER      NOT NULL DEFAULT 40000 CHECK (pump_flow_lph > 0),   -- litres / hour
  village         VARCHAR(80),
  latitude        NUMERIC(9,6) CHECK (latitude  BETWEEN -90  AND 90),
  longitude       NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ux_field_name_per_farmer UNIQUE (farmer_id, field_name)
);
CREATE INDEX ix_fields_farmer ON fields (farmer_id);
CREATE TRIGGER trg_fields_touch BEFORE UPDATE ON fields
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. SENSORS
-- ---------------------------------------------------------------------
CREATE TABLE sensors (
  sensor_id         VARCHAR(12) PRIMARY KEY
                    DEFAULT ('SNS-' || lpad(nextval('sensor_id_seq')::text, 5, '0')),
  field_id          VARCHAR(12) NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
  sensor_type       VARCHAR(20) NOT NULL CHECK (sensor_type IN ('SOIL_MOISTURE','TEMPERATURE','HUMIDITY')),
  sensor_location   VARCHAR(100) NOT NULL DEFAULT 'Field centre',
  unit              VARCHAR(5)  GENERATED ALWAYS AS (
                      CASE sensor_type WHEN 'TEMPERATURE' THEN '°C' ELSE '%' END) STORED,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  device_key        VARCHAR(64) UNIQUE,                     -- optional per-device ingest key
  last_reading      NUMERIC(6,2),                           -- denormalised cache, maintained by trigger
  last_reading_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sensors_field ON sensors (field_id);
CREATE INDEX ix_sensors_field_type ON sensors (field_id, sensor_type);
CREATE TRIGGER trg_sensors_touch BEFORE UPDATE ON sensors
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. SENSOR READINGS  (missing data is a first-class state, not a NULL accident)
-- ---------------------------------------------------------------------
CREATE TABLE sensor_readings (
  reading_id   BIGSERIAL    PRIMARY KEY,
  sensor_id    VARCHAR(12)  NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
  value        NUMERIC(6,2),
  "timestamp"  TIMESTAMPTZ  NOT NULL,
  status       VARCHAR(8)   NOT NULL DEFAULT 'GOOD' CHECK (status IN ('GOOD','MISSING')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- a GOOD reading must carry a value, a MISSING one must not
  CONSTRAINT ck_reading_status_value CHECK (
      (status = 'GOOD'    AND value IS NOT NULL)
   OR (status = 'MISSING' AND value IS NULL)),
  -- physical plausibility envelope for all supported sensor types
  CONSTRAINT ck_reading_range CHECK (value IS NULL OR value BETWEEN -40 AND 100),
  CONSTRAINT ux_reading_sensor_time UNIQUE (sensor_id, "timestamp")   -- idempotent re-uploads
);
-- Most queries: "latest N readings for a sensor" and "readings for a sensor in a window"
CREATE INDEX ix_readings_sensor_time ON sensor_readings (sensor_id, "timestamp" DESC);
CREATE INDEX ix_readings_missing ON sensor_readings (sensor_id, "timestamp") WHERE status = 'MISSING';

-- Keep sensors.last_reading in sync with the newest GOOD reading
CREATE OR REPLACE FUNCTION sync_sensor_last_reading() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'GOOD' THEN
    UPDATE sensors
       SET last_reading = NEW.value, last_reading_at = NEW."timestamp"
     WHERE sensor_id = NEW.sensor_id
       AND (last_reading_at IS NULL OR last_reading_at <= NEW."timestamp");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_readings_sync AFTER INSERT OR UPDATE ON sensor_readings
  FOR EACH ROW EXECUTE FUNCTION sync_sensor_last_reading();

-- ---------------------------------------------------------------------
-- 5. RECOMMENDATIONS
-- ---------------------------------------------------------------------
CREATE TABLE recommendations (
  rec_id        BIGSERIAL    PRIMARY KEY,
  field_id      VARCHAR(12)  NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
  type          VARCHAR(12)  NOT NULL CHECK (type IN ('IRRIGATION','FERTILIZER','ALERT')),
  priority      VARCHAR(8)   NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  action        VARCHAR(255) NOT NULL,                 -- short instruction shown to the farmer
  explanation   TEXT         NOT NULL,                 -- "why this recommendation"
  details       JSONB        NOT NULL DEFAULT '{}',    -- inputs & computed quantities
  rule_code     VARCHAR(40)  NOT NULL,                 -- e.g. IRR_LOW_MOISTURE, FERT_N_LOW
  status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPLIED','DISMISSED','EXPIRED')),
  applied       BOOLEAN      GENERATED ALWAYS AS (status = 'APPLIED') STORED,
  "timestamp"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  CONSTRAINT ck_rec_resolved CHECK ((status = 'PENDING') = (resolved_at IS NULL))
);
CREATE INDEX ix_recs_field_time ON recommendations (field_id, "timestamp" DESC);
-- at most one open recommendation per field per rule → engine can upsert safely
CREATE UNIQUE INDEX ux_recs_one_pending ON recommendations (field_id, rule_code) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------
-- 6. IRRIGATION LOGS
-- ---------------------------------------------------------------------
CREATE TABLE irrigation_logs (
  log_id          BIGSERIAL    PRIMARY KEY,
  field_id        VARCHAR(12)  NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
  rec_id          BIGINT       REFERENCES recommendations(rec_id) ON DELETE SET NULL,
  "timestamp"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  duration        INTEGER      NOT NULL CHECK (duration BETWEEN 1 AND 1440),     -- minutes
  water_amount    NUMERIC(12,1) NOT NULL CHECK (water_amount > 0),              -- litres
  method          VARCHAR(12)  CHECK (method IN ('Flood','Drip','Sprinkler')),
  notes           VARCHAR(255)
);
CREATE INDEX ix_irrlogs_field_time ON irrigation_logs (field_id, "timestamp" DESC);

-- ---------------------------------------------------------------------
-- 7. FERTILIZER LOGS
-- ---------------------------------------------------------------------
CREATE TABLE fertilizer_logs (
  log_id        BIGSERIAL    PRIMARY KEY,
  field_id      VARCHAR(12)  NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
  rec_id        BIGINT       REFERENCES recommendations(rec_id) ON DELETE SET NULL,
  "timestamp"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  type          VARCHAR(20)  NOT NULL CHECK (type IN ('Urea','DAP','MOP','NPK','Organic','Zinc Sulphate')),
  amount        NUMERIC(9,2) NOT NULL CHECK (amount > 0 AND amount <= 10000),  -- kg (whole field)
  notes         VARCHAR(255)
);
CREATE INDEX ix_fertlogs_field_time ON fertilizer_logs (field_id, "timestamp" DESC);

-- ---------------------------------------------------------------------
-- 8. CROP RECORDS  (historical season data imported from SUGARCANE_FARMER_DATABASE.xlsx)
--    farmer is reachable through field → not stored again (3NF)
-- ---------------------------------------------------------------------
CREATE TABLE crop_records (
  record_id            VARCHAR(12)  PRIMARY KEY,
  field_id             VARCHAR(12)  NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
  season_year          SMALLINT     CHECK (season_year BETWEEN 1990 AND 2100),
  season               VARCHAR(10)  CHECK (season IN ('Kharif','Rabi','Zaid')),
  variety              VARCHAR(20),
  planting_date        DATE,
  harvesting_date      DATE,
  growth_stage         VARCHAR(10)  CHECK (growth_stage IN ('Early','Mid','Late')),
  yield_q_per_acre     NUMERIC(7,2) CHECK (yield_q_per_acre >= 0),
  temperature_avg      NUMERIC(5,2),
  humidity             NUMERIC(5,2) CHECK (humidity BETWEEN 0 AND 100),
  rainfall_total_mm    NUMERIC(7,1) CHECK (rainfall_total_mm >= 0),
  soil_moisture_pct    NUMERIC(5,2) CHECK (soil_moisture_pct BETWEEN 0 AND 100),
  soil_ph              NUMERIC(4,2) CHECK (soil_ph BETWEEN 0 AND 14),
  soil_ec              NUMERIC(5,2),
  nitrogen_kg_acre     NUMERIC(7,2) CHECK (nitrogen_kg_acre   >= 0),
  phosphorus_kg_acre   NUMERIC(7,2) CHECK (phosphorus_kg_acre >= 0),
  potassium_kg_acre    NUMERIC(7,2) CHECK (potassium_kg_acre  >= 0),
  fertilizer_type      VARCHAR(20),
  fertilizer_qty       NUMERIC(8,2),
  irrigation_method    VARCHAR(12),
  water_l_per_acre     NUMERIC(10,1),
  disease_type         VARCHAR(30),
  disease_severity     VARCHAR(10),
  pest_level           VARCHAR(10),
  brix_value           NUMERIC(5,2),
  CONSTRAINT ck_crop_dates CHECK (harvesting_date IS NULL OR planting_date IS NULL OR harvesting_date >= planting_date)
);
CREATE INDEX ix_crop_field_year ON crop_records (field_id, season_year DESC);

-- ---------------------------------------------------------------------
-- 9. THRESHOLDS  (one row per farmer; defaults tuned for sugarcane in Haridwar alluvial soils)
-- ---------------------------------------------------------------------
CREATE TABLE thresholds (
  farmer_id            VARCHAR(12)  PRIMARY KEY REFERENCES farmers(farmer_id) ON DELETE CASCADE,
  moisture_critical    NUMERIC(5,2) NOT NULL DEFAULT 15,
  moisture_low         NUMERIC(5,2) NOT NULL DEFAULT 22,
  moisture_target      NUMERIC(5,2) NOT NULL DEFAULT 32,
  moisture_high        NUMERIC(5,2) NOT NULL DEFAULT 40,
  temp_high            NUMERIC(5,2) NOT NULL DEFAULT 38,
  temp_low             NUMERIC(5,2) NOT NULL DEFAULT 10,
  humidity_high        NUMERIC(5,2) NOT NULL DEFAULT 85,
  humidity_low         NUMERIC(5,2) NOT NULL DEFAULT 35,
  nitrogen_min         NUMERIC(6,2) NOT NULL DEFAULT 100,   -- kg/acre available N
  phosphorus_min       NUMERIC(6,2) NOT NULL DEFAULT 35,
  potassium_min        NUMERIC(6,2) NOT NULL DEFAULT 70,
  root_zone_mm         INTEGER      NOT NULL DEFAULT 450,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_moisture_order CHECK (
      0 <= moisture_critical AND moisture_critical < moisture_low
      AND moisture_low < moisture_target AND moisture_target < moisture_high AND moisture_high <= 100),
  CONSTRAINT ck_temp_order     CHECK (temp_low < temp_high),
  CONSTRAINT ck_humidity_order CHECK (0 <= humidity_low AND humidity_low < humidity_high AND humidity_high <= 100),
  CONSTRAINT ck_npk_positive   CHECK (nitrogen_min > 0 AND phosphorus_min > 0 AND potassium_min > 0),
  CONSTRAINT ck_root_zone      CHECK (root_zone_mm BETWEEN 100 AND 2000)
);
CREATE TRIGGER trg_thresholds_touch BEFORE UPDATE ON thresholds
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- every new farmer automatically gets default thresholds
CREATE OR REPLACE FUNCTION create_default_thresholds() RETURNS trigger AS $$
BEGIN
  INSERT INTO thresholds (farmer_id) VALUES (NEW.farmer_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_farmers_thresholds AFTER INSERT ON farmers
  FOR EACH ROW EXECUTE FUNCTION create_default_thresholds();

-- ---------------------------------------------------------------------
-- 10. AUTH TOKENS  (email verification, password reset, JWT revocation on logout)
-- ---------------------------------------------------------------------
CREATE TABLE auth_tokens (
  token_hash   CHAR(64)     PRIMARY KEY,                -- sha256 of the token / JWT jti
  farmer_id    VARCHAR(12)  NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
  purpose      VARCHAR(12)  NOT NULL CHECK (purpose IN ('VERIFY','RESET','REVOKED')),
  expires_at   TIMESTAMPTZ  NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_tokens_expiry ON auth_tokens (expires_at);

-- ---------------------------------------------------------------------
-- Convenience view: latest reading per sensor (incl. staleness)
-- ---------------------------------------------------------------------
CREATE VIEW v_sensor_status AS
SELECT s.sensor_id, s.field_id, s.sensor_type, s.unit, s.sensor_location, s.is_active,
       s.last_reading, s.last_reading_at,
       CASE
         WHEN NOT s.is_active                                    THEN 'INACTIVE'
         WHEN s.last_reading_at IS NULL                          THEN 'NO_DATA'
         WHEN s.last_reading_at < now() - interval '6 hours'     THEN 'STALE'
         ELSE 'ONLINE'
       END AS health
  FROM sensors s;

COMMIT;
