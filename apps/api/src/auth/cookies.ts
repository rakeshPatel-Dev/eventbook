import type { Response } from 'express';
import type { CookieSameSite } from '../config.js';

// Single place for session-cookie settings, shared by login, registration,
// and logout so attributes can never drift between set and clear.
export const SESSION_COOKIE_NAME = 'eventbook_session';

// Seven days, in milliseconds (Express maxAge) and as the DB expires_at.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CookieConfig {
  sameSite: CookieSameSite;
  /** Secure cookies (HTTPS only). True in production, false for local HTTP. */
  secure: boolean;
}

function baseOptions(config: CookieConfig) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/',
  } as const;
}

export function setSessionCookie(res: Response, token: string, config: CookieConfig): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...baseOptions(config),
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, config: CookieConfig): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...baseOptions(config),
    maxAge: 0,
  });
}

// Minimal cookie parser (avoids a dependency for one small job).
export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
