import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function signToken(farmerId, remember = false) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: farmerId, jti }, config.jwtSecret, {
    expiresIn: remember ? config.jwtTtlRemember : config.jwtTtlShort,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  // EventSource cannot set headers, so the SSE stream accepts ?token=
  if (req.path.endsWith('/stream') && typeof req.query.token === 'string') return req.query.token;
  return null;
}

async function verify(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (e) {
    throw unauthorized(e.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token');
  }
  const { rows } = await query(
    `SELECT 1 FROM auth_tokens WHERE token_hash = $1 AND purpose = 'REVOKED'`, [sha256(payload.jti)]);
  if (rows.length) throw unauthorized('Session has been logged out');
  return payload;
}

/** Requires a valid farmer JWT. Sets req.user = { farmerId, jti, exp }. */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();
    const p = await verify(token);
    req.user = { farmerId: p.sub, jti: p.jti, exp: p.exp };
    next();
  } catch (e) { next(e); }
}

/**
 * Accepts EITHER a farmer JWT OR the gateway X-Device-Key (for sensor uploads).
 * Sets req.user (farmer) or req.device = true.
 */
export async function requireAuthOrDevice(req, res, next) {
  const key = req.get('X-Device-Key');
  if (key) {
    const ok = config.ingestApiKey &&
      key.length === config.ingestApiKey.length &&
      crypto.timingSafeEqual(Buffer.from(key), Buffer.from(config.ingestApiKey));
    if (!ok) return next(unauthorized('Invalid device key'));
    req.device = true;
    return next();
  }
  return requireAuth(req, res, next);
}

/** Route guard: the :id path param must be the logged-in farmer. */
export const requireSelf = (param = 'id') => (req, _res, next) =>
  req.params[param] === req.user.farmerId ? next() : next(forbidden());
