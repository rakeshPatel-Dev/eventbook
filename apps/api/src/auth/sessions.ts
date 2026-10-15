import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { SESSION_TTL_MS } from './cookies.js';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

// Opaque 256-bit token. Only this hex string ever leaves the server
// (inside the HttpOnly cookie); the database keeps just its SHA-256 hash.
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createSession(
  pool: Pool,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    hashToken(token),
    expiresAt.toISOString(),
  ]);
  return { token, expiresAt };
}

// Returns the user for a live session, or null for missing, unknown, or
// expired tokens. Expiry is enforced here in SQL on every lookup.
export async function findSessionUser(pool: Pool, token: string): Promise<SessionUser | null> {
  const result = await pool.query(
    `SELECT u.id, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (result.rowCount !== 1) {
    return null;
  }
  const row = result.rows[0] as { id: string; email: string; role: string };
  return { id: row.id, email: row.email, role: row.role };
}

export async function deleteSessionByToken(pool: Pool, token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

// Best-effort cleanup of naturally expired rows. Called on login; failures
// are swallowed by the caller so housekeeping can never break logging in.
export async function deleteExpiredSessions(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
}
