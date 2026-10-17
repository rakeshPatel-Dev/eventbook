import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { createPool } from '../db/pool.js';
import { SESSION_COOKIE_NAME } from '../auth/cookies.js';

// Shared setup for API integration tests: a real app on an ephemeral port
// against TEST_DATABASE_URL. Each suite truncates tables between cases.
export interface TestServer {
  pool: Pool;
  baseUrl: string;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'Set TEST_DATABASE_URL to an isolated test database, e.g. ' +
        'TEST_DATABASE_URL=postgresql://postgres@localhost:5432/eventbook_test',
    );
  }
  const pool = createPool(testDatabaseUrl);
  const schemaPath = resolve(__dirname, '../../../../database/schema.sql');
  await pool.query(readFileSync(schemaPath, 'utf8'));
  const app = createApp({
    pool,
    frontendOrigin: 'http://localhost:3000',
    cookie: { sameSite: 'lax', secure: false },
  });
  const server: Server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return {
    pool,
    baseUrl: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      });
      await pool.end();
    },
  };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE users, events, bookings, sessions CASCADE');
}

export async function api(baseUrl: string, path: string, init?: RequestInit, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // Mutating event/booking routes require this header (CSRF guard).
      'x-requested-with': 'XMLHttpRequest',
      ...(cookie ? { cookie } : {}),
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, body };
}

export function sessionCookie(res: Response): string | null {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const found = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(prefix));
  return found ? found.split(';')[0] : null;
}

export async function registerUser(
  baseUrl: string,
  email: string,
  password = 'Password123',
): Promise<string> {
  const { res } = await api(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 201) {
    throw new Error(`setup register failed for ${email}: ${res.status}`);
  }
  const cookie = sessionCookie(res);
  if (!cookie) {
    throw new Error('setup register returned no session cookie');
  }
  return cookie;
}

// Registers through the public endpoint, then promotes via SQL: the only
// supported path to an admin account, mirroring the seed script.
export async function registerAdmin(
  pool: Pool,
  baseUrl: string,
  email: string,
  password = 'AdminPass123',
): Promise<string> {
  const cookie = await registerUser(baseUrl, email, password);
  await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
  return cookie;
}

export async function createEvent(
  baseUrl: string,
  adminCookie: string,
  event: Record<string, unknown>,
): Promise<{ id: string }> {
  const { res, body } = await api(
    baseUrl,
    '/api/events',
    { method: 'POST', body: JSON.stringify(event) },
    adminCookie,
  );
  if (res.status !== 201) {
    throw new Error(`setup createEvent failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { id: (body?.event as { id: string }).id };
}

export function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function pastIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
