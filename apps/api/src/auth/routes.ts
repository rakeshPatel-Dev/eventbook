import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import {
  clearSessionCookie,
  getCookieValue,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  type CookieConfig,
} from './cookies.js';
import { requireAuth, requireSameOrigin } from './middleware.js';
import { burnLoginTiming, hashPassword, verifyPassword } from './password.js';
import { createSession, deleteExpiredSessions, deleteSessionByToken } from './sessions.js';
import { isValidEmail, normalizeEmail, passwordError } from './validation.js';

interface SafeUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface AuthRouterDeps {
  pool: Pool;
  cookie: CookieConfig;
  frontendOrigin: string;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { pool, cookie, frontendOrigin } = deps;
  const router = Router();
  const requireOrigin = requireSameOrigin(frontendOrigin);

  // Throttle credential stuffing and account creation spam.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });

  router.post('/register', authLimiter, requireOrigin, async (req, res, next) => {
    try {
      const { email: rawEmail, password } = req.body as { email?: unknown; password?: unknown };
      if (typeof rawEmail !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      const invalidPassword = passwordError(password);
      if (invalidPassword) {
        res.status(400).json({ error: invalidPassword });
        return;
      }
      // role is never read from the request body: registrations are users.
      const passwordHash = await hashPassword(password as string);
      let row: UserRow;
      try {
        const result = await pool.query(
          `INSERT INTO users (email, password_hash, role)
           VALUES ($1, $2, 'user')
           RETURNING id, email, password_hash, role, created_at, updated_at`,
          [email, passwordHash],
        );
        row = result.rows[0] as UserRow;
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          res.status(409).json({ error: 'Email is already registered.' });
          return;
        }
        throw err;
      }
      const { token } = await createSession(pool, row.id);
      // Housekeeping that must never break registration.
      void deleteExpiredSessions(pool).catch(() => undefined);
      setSessionCookie(res, token, cookie);
      res.status(201).json({ user: toSafeUser(row) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', authLimiter, requireOrigin, async (req, res, next) => {
    try {
      const { email: rawEmail, password } = req.body as { email?: unknown; password?: unknown };
      if (typeof rawEmail !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const email = normalizeEmail(rawEmail);
      const result = await pool.query(
        'SELECT id, email, password_hash, role, created_at, updated_at FROM users WHERE email = $1',
        [email],
      );
      const row = (result.rows[0] as UserRow | undefined) ?? null;
      // Same generic response whether the account is missing or the
      // password is wrong, so callers cannot enumerate registered emails.
      if (!row) {
        await burnLoginTiming();
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      if (!(await verifyPassword(password, row.password_hash))) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const { token } = await createSession(pool, row.id);
      void deleteExpiredSessions(pool).catch(() => undefined);
      setSessionCookie(res, token, cookie);
      res.status(200).json({ user: toSafeUser(row) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', requireOrigin, async (req, res, next) => {
    try {
      // Revoke server-side first; safe to call with no session at all.
      const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
      if (token) {
        await deleteSessionByToken(pool, token);
      }
      // Same path/attributes as when set, or the browser keeps the cookie.
      clearSessionCookie(res, cookie);
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth(pool), async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT id, email, password_hash, role, created_at, updated_at FROM users WHERE id = $1',
        [req.auth?.userId],
      );
      const row = result.rows[0] as UserRow | undefined;
      if (!row) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      // requireAuth already proved the session live; this re-read only
      // supplies timestamps for the response.
      res.status(200).json({ user: toSafeUser(row) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
