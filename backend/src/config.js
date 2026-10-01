import 'dotenv/config';

const required = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  // Neon / Supabase / Render require TLS; local Postgres usually does not.
  databaseSsl: (process.env.DATABASE_SSL ?? (isProd ? 'true' : 'false')) === 'true',
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-secret-change-me'),
  jwtTtlShort: process.env.JWT_TTL || '1d',
  jwtTtlRemember: process.env.JWT_TTL_REMEMBER || '30d',
  // bare hostnames (e.g. injected by a Render blueprint) are treated as https://host
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
    .map((s) => (/^https?:\/\//.test(s) || s.startsWith('*.') || s === '*' ? s : `https://${s}`)),
  // Shared key that IoT gateways send as X-Device-Key when uploading readings
  ingestApiKey: process.env.INGEST_API_KEY || '',
  appUrl: ((u) => (/^https?:\/\//.test(u) ? u : `https://${u}`))(process.env.APP_URL || 'http://localhost:5173'),
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        from: process.env.SMTP_FROM || 'Smart Farm Advisory <no-reply@smartfarm.local>',
      }
    : null,
  weatherEnabled: process.env.WEATHER_ENABLED !== 'false',
};
