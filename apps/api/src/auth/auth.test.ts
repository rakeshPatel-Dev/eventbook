import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { createPool } from '../db/pool.js';
import { SESSION_COOKIE_NAME } from './cookies.js';
import { requireAdmin, requireAuth } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';

// Integration tests against a real PostgreSQL database. Nothing is mocked:
// the app, the pool, and every query run for real. The auth middlewares are
// additionally unit-tested directly (see 'requireAdmin allows admins...').
// Run: TEST_DATABASE_URL=postgresql://.../eventbook_test npm test --workspace=apps/api

const SESSION_COOKIE_PREFIX = `${SESSION_COOKIE_NAME}=`;

let pool: Pool;
let baseUrl = '';

async function api(path: string, init?: RequestInit, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, body };
}

function sessionCookie(res: Response): string | null {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const match = setCookies.find((c) => c.startsWith(SESSION_COOKIE_PREFIX));
  return match ? match.split(';')[0] : null;
}

function setCookieHeader(res: Response): string {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.find((c) => c.startsWith(SESSION_COOKIE_PREFIX)) ?? '';
}

async function register(email: string, password: string, extraBody?: Record<string, unknown>) {
  return api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...extraBody }),
  });
}

async function login(email: string, password: string, headers?: Record<string, string>) {
  return api(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }), headers },
    undefined,
  );
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('auth', () => {
  let server: Server | undefined;

  before(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
      throw new Error(
        'Set TEST_DATABASE_URL to an isolated test database, e.g. ' +
          'TEST_DATABASE_URL=postgresql://postgres@localhost:5432/eventbook_test',
      );
    }
    pool = createPool(testDatabaseUrl);
    const schemaPath = resolve(__dirname, '../../../../database/schema.sql');
    await pool.query(readFileSync(schemaPath, 'utf8'));
    const app = createApp({
      pool,
      frontendOrigin: 'http://localhost:3000',
      cookie: { sameSite: 'lax', secure: false },
    });
    server = app.listen(0);
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server?.close((err) => (err ? rejectPromise(err) : resolvePromise()));
    });
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE users, events, bookings, sessions CASCADE');
  });

  it('registers a user, ignores role=admin, hashes the password, sets a cookie', async () => {
    const { res, body } = await register('new@example.com', 'Password123', { role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal((body?.user as { role: string }).role, 'user');
    assert.ok(!(body?.user as object) || !('password_hash' in (body?.user as object)));
    const newUserCookie = sessionCookie(res);
    assert.ok(newUserCookie && newUserCookie.length > SESSION_COOKIE_PREFIX.length);

    const db = await pool.query('SELECT role, password_hash FROM users WHERE email = $1', [
      'new@example.com',
    ]);
    assert.equal(db.rows[0].role, 'user');
    assert.ok(await verifyPassword('Password123', db.rows[0].password_hash as string));
    assert.ok(!(db.rows[0].password_hash as string).includes('Password123'));
  });

  it('rejects duplicate registration with 409', async () => {
    assert.equal((await register('dup@example.com', 'Password123')).res.status, 201);
    const { res, body } = await register('dup@example.com', 'Password123');
    assert.equal(res.status, 409);
    assert.match((body?.error as string) ?? '', /already registered/);
  });

  it('logs in with an HttpOnly cookie and no raw token in the body', async () => {
    await register('login@example.com', 'Password123');
    const { res, body } = await login('login@example.com', 'Password123');
    assert.equal(res.status, 200);
    const header = setCookieHeader(res);
    assert.match(header, /HttpOnly/);
    assert.match(header, /Path=\//);
    const cookie = sessionCookie(res);
    assert.ok(cookie);
    const rawToken = cookie.slice(SESSION_COOKIE_PREFIX.length);
    assert.ok(rawToken.length >= 32);
    assert.ok(!JSON.stringify(body).includes(rawToken));
  });

  it('rejects wrong and unknown credentials with the same generic 401', async () => {
    await register('owner@example.com', 'Password123');
    const wrong = await login('owner@example.com', 'WrongPassword1');
    const unknown = await login('ghost@example.com', 'Password123');
    assert.equal(wrong.res.status, 401);
    assert.equal(unknown.res.status, 401);
    assert.equal(wrong.body?.error, 'Invalid email or password.');
    assert.equal(unknown.body?.error, 'Invalid email or password.');
  });

  it('rejects expired sessions', async () => {
    await register('old@example.com', 'Password123');
    const userId = (await pool.query("SELECT id FROM users WHERE email = 'old@example.com'"))
      .rows[0].id as string;
    // Age the whole row: the schema CHECK (expires_at > created_at) forbids
    // backdating expires_at alone, so created_at moves back with it.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, now() - interval '1 day', now() - interval '8 days')`,
      [userId, tokenHash],
    );
    const { res } = await api('/api/auth/me', {}, `${SESSION_COOKIE_NAME}=${rawToken}`);
    assert.equal(res.status, 401);
  });

  it('rejects malformed cookies and JSON bodies without a 500', async () => {
    const badCookie = await api('/api/auth/me', {}, `${SESSION_COOKIE_NAME}=%`);
    assert.equal(badCookie.res.status, 401);
    const badJson = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(badJson.status, 400);
    assert.equal(
      ((await badJson.json()) as { error: string }).error,
      'Invalid JSON in request body.',
    );
  });

  it('accepts /me with a valid session', async () => {
    await register('me@example.com', 'Password123');
    const logged = await login('me@example.com', 'Password123');
    const cookie = sessionCookie(logged.res);
    assert.ok(cookie);
    const { res, body } = await api('/api/auth/me', {}, cookie);
    assert.equal(res.status, 200);
    assert.equal((body?.user as { email: string }).email, 'me@example.com');
    assert.ok(!('password_hash' in ((body?.user as object) ?? {})));
  });

  it('logs out: clears the cookie and revokes the session', async () => {
    await register('bye@example.com', 'Password123');
    const logged = await login('bye@example.com', 'Password123');
    const cookie = sessionCookie(logged.res);
    assert.ok(cookie);
    const { res } = await api('/api/auth/logout', { method: 'POST' }, cookie);
    assert.equal(res.status, 200);
    assert.match(setCookieHeader(res), /1970/);
    const afterLogout = await api('/api/auth/me', {}, cookie);
    assert.equal(afterLogout.res.status, 401);
    // The logged-out token's row is gone; the earlier registration session
    // (a different token) correctly remains.
    const token = cookie.slice(SESSION_COOKIE_PREFIX.length);
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const sessions = await pool.query('SELECT count(*) AS n FROM sessions WHERE token_hash = $1', [
      tokenHash,
    ]);
    assert.equal(sessions.rows[0].n, '0');
  });

  it('logout without a session still succeeds', async () => {
    const { res, body } = await api('/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(body?.status, 'ok');
  });

  it('requireAdmin allows admins and rejects users and strangers', async () => {
    await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('boss@example.com', $1, 'admin')",
      [await hashPassword('AdminPass123')],
    );
    await register('plain@example.com', 'Password123');
    const adminCookie = sessionCookie((await login('boss@example.com', 'AdminPass123')).res);
    const userCookie = sessionCookie((await login('plain@example.com', 'Password123')).res);
    assert.ok(adminCookie && userCookie);

    async function runThrough(cookie: string | undefined) {
      const req = { headers: { cookie }, auth: undefined } as unknown as Request;
      const res = mockRes();
      let authed = false;
      await requireAuth(pool)(
        req,
        res as unknown as ExpressResponse,
        (() => {
          authed = true;
        }) as NextFunction,
      );
      if (!authed) {
        return { status: res.statusCode, authed: false, admin: false };
      }
      let allowed = false;
      requireAdmin()(
        req,
        res as unknown as ExpressResponse,
        (() => {
          allowed = true;
        }) as NextFunction,
      );
      return { status: res.statusCode, authed: true, admin: allowed };
    }

    const admin = await runThrough(adminCookie);
    assert.equal(admin.admin, true);
    const user = await runThrough(userCookie);
    assert.equal(user.authed, true);
    assert.equal(user.admin, false);
    const stranger = await runThrough(undefined);
    assert.equal(stranger.authed, false);
  });

  it('rejects cross-origin POSTs to auth endpoints', async () => {
    await register('csrf@example.com', 'Password123');
    const { res } = await login('csrf@example.com', 'Password123', {
      origin: 'https://evil.test',
    });
    assert.equal(res.status, 403);
  });
});
