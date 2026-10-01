import { Router } from 'express';
import { ah, ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ownedField } from '../lib/ownership.js';
import { config } from '../config.js';

/**
 * GET /api/weather/:fieldId — current conditions + 3-day forecast for the field's location.
 * Uses Open-Meteo (free, no API key). Responses are cached in memory for 30 minutes.
 */
const r = Router();
r.use(requireAuth);
const cache = new Map();
const TTL = 30 * 60 * 1000;

r.get('/:fieldId', ah(async (req, res) => {
  if (!config.weatherEnabled) throw new ApiError(503, 'WEATHER_DISABLED', 'Weather is disabled on this server');
  const f = await ownedField(req.params.fieldId, req.user.farmerId);
  const lat = f.latitude ?? 29.95, lon = f.longitude ?? 78.16;              // default: Haridwar
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return res.json({ ...hit.data, cached: true });

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,weather_code' +
    '&timezone=Asia%2FKolkata&forecast_days=3';
  let json;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    json = await resp.json();
  } catch (e) {
    throw new ApiError(503, 'WEATHER_UNAVAILABLE', `Weather service unreachable (${e.message})`);
  }
  const rainNext3d = (json.daily?.precipitation_sum ?? []).reduce((a, b) => a + (b ?? 0), 0);
  const data = {
    location: { latitude: lat, longitude: lon, field_id: f.field_id },
    current: json.current, daily: json.daily, units: { ...json.current_units, ...json.daily_units },
    advice: rainNext3d >= 20
      ? `About ${Math.round(rainNext3d)} mm of rain is expected in the next 3 days — you may be able to postpone irrigation.`
      : null,
  };
  cache.set(key, { at: Date.now(), data });
  res.json(data);
}));

export default r;
