import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    // Keep one connection warm: the first query on a cold pool otherwise
    // pays a full TLS handshake to Supabase (seconds from far regions).
    min: 1,
    // Reap idle connections after a minute; hosted Postgres caps them.
    idleTimeoutMillis: 60_000,
    // Fail fast instead of hanging a request forever on a dead network.
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error', err);
  });

  return pool;
}
