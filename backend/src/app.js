import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ApiError } from './lib/errors.js';
import auth from './routes/auth.js';
import farmers from './routes/farmers.js';
import fields from './routes/fields.js';
import sensors from './routes/sensors.js';
import readings from './routes/readings.js';
import recommendations from './routes/recommendations.js';
import dashboard from './routes/dashboard.js';
import thresholds from './routes/settings.js';
import weather from './routes/weather.js';
import exportRoutes from './routes/export.js';
import stream from './routes/stream.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render / Railway / Fly sit behind a proxy

  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      // allow same-origin / curl (no Origin header), configured origins, and Vercel/Netlify/Pages previews if wildcarded
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.some((o) =>
        o === origin || (o.startsWith('*.') && origin.endsWith(o.slice(1))))) return cb(null, true);
      cb(new ApiError(403, 'CORS_BLOCKED', `Origin ${origin} is not allowed`));
    },
    credentials: false,
  }));
  // compression would buffer SSE — skip it for the stream
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  // health check (used by hosting platforms and keep-alive pingers)
  app.get('/api/health', async (_req, res) => {
    const t = Date.now();
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', dbLatencyMs: Date.now() - t, time: new Date().toISOString() });
    } catch (e) {
      res.status(503).json({ status: 'degraded', db: 'unreachable', error: e.message });
    }
  });
  app.get('/', (_req, res) => res.json({ name: 'Smart Farm Advisory API', docs: '/api/health', version: '1.0.0' }));

  app.use('/api/auth', auth);
  app.use('/api/farmers', farmers);
  app.use('/api/fields', fields);
  app.use('/api/sensors', sensors);
  app.use('/api/readings', readings);
  app.use('/api/recommendations', recommendations);
  app.use('/api/dashboard', dashboard);
  app.use('/api/thresholds', thresholds);
  app.use('/api/weather', weather);
  app.use('/api/export', exportRoutes);
  app.use('/api', stream);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
