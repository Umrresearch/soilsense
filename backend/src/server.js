import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { startDemoFeed } from './services/demoFeed.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`🌾 SoilSense API listening on :${config.port} (${config.env})`);
  if (process.env.DEMO_FEED === 'true') startDemoFeed();
});

// graceful shutdown (Render/Railway send SIGTERM on deploy)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} received, closing…`);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
