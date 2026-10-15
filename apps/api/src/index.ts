import type { Server } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = createApp({
  pool,
  frontendOrigin: config.frontendOrigin,
  cookie: { sameSite: config.cookieSameSite, secure: config.isProduction },
});

const server: Server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);

  server.close(async () => {
    try {
      await pool.end();
      console.log('PostgreSQL pool closed');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
