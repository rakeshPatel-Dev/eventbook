import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { getCookieValue, SESSION_COOKIE_NAME } from './cookies.js';
import { findSessionUser } from './sessions.js';

// Safe data attached to the request. Only id, email, and role: never
// password hashes, session tokens, or anything else from the database.
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

// Reads the session cookie, validates it against live (unexpired) sessions,
// and attaches the user. Never trusts ids or roles sent by the client.
export function requireAuth(pool: Pool): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
      if (!token) {
        unauthorized(res);
        return;
      }
      const user = await findSessionUser(pool, token);
      if (!user) {
        unauthorized(res);
        return;
      }
      req.auth = { userId: user.id, email: user.email, role: user.role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Must run after requireAuth. Allows only database-loaded admin roles;
// frontend route protection is never a substitute for this check.
export function requireAdmin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      unauthorized(res);
      return;
    }
    if (req.auth.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

// Proportionate CSRF protection for cookie-authenticated POST endpoints.
// Browsers always send Origin on fetch POSTs; same-origin requests pass,
// cross-site requests are rejected. Non-browser clients (curl, tests) send
// no Origin header and are unaffected.
export function requireSameOrigin(frontendOrigin: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && origin !== frontendOrigin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
