import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { bus } from '../services/events.js';

/**
 * GET /api/stream?token=JWT — Server-Sent Events.
 * Emits `reading` and `recommendations` events for the logged-in farmer.
 * The frontend falls back to polling if the stream drops (e.g. free-tier cold starts).
 */
const r = Router();

r.get('/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ farmer_id: req.user.farmerId })}\n\n`);

  const channel = `farmer:${req.user.farmerId}`;
  const onEvent = ({ type, data }) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  bus.on(channel, onEvent);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);   // keep proxies from closing the stream

  req.on('close', () => { clearInterval(ping); bus.off(channel, onEvent); });
});

export default r;
