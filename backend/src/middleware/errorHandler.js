import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { config } from '../config.js';

// Map Postgres constraint errors to friendly API errors
const PG = { UNIQUE: '23505', FK: '23503', CHECK: '23514', NOT_NULL: '23502', BAD_TEXT: '22P02' };

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.code === PG.UNIQUE) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these details already exists', details: err.detail } });
  }
  if (err?.code === PG.FK) {
    return res.status(400).json({ error: { code: 'INVALID_REFERENCE', message: 'Referenced record does not exist', details: err.detail } });
  }
  if (err?.code === PG.CHECK || err?.code === PG.NOT_NULL || err?.code === PG.BAD_TEXT) {
    return res.status(400).json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'Value outside the allowed range', details: err.constraint || err.message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  console.error('[error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', ...(config.isProd ? {} : { details: err.message }) },
  });
}
