import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';

// Repeatable admin seed for EventBook.
// Usage: npm run db:seed (runs from apps/api).
// Seeds the admin account only (upsert on fixed id). Events, bookings,
// and regular users are NOT seeded — they are managed through the
// admin UI. Production seeding (NODE_ENV = production) requires a
// strong SEED_ADMIN_PASSWORD, which is never logged. No sessions are
// created.

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), 'apps/api/.env') });
}

const ADMIN_EMAIL = 'admin@example.com';
const LOCAL_ADMIN_PASSWORD = 'Admin123!';

// Fixed id keeps the seed idempotent (upserts match on this).
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function isStrongPassword(value: string): boolean {
  return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

interface SeedUser {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

// Inserts the seed user or refreshes its credentials. Fails loudly when the
// email is corrupted across rows.
async function upsertSeedUser(client: PoolClient, seed: SeedUser): Promise<string> {
  const existing = await client.query('SELECT id, role FROM users WHERE email = $1', [seed.email]);
  const passwordHash = await bcrypt.hash(seed.password, 10);
  if ((existing.rowCount ?? 0) > 1) {
    throw new Error(
      `Seed conflict: email ${seed.email} is attached to ${existing.rowCount} user rows. ` +
        'Refusing to guess which account the seed data belongs to. ' +
        'Resolve it manually (delete or migrate the extra rows) before re-running the seed.',
    );
  }
  if (existing.rowCount === 0) {
    await client.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [seed.id, seed.email, passwordHash, seed.role],
    );
    return seed.id;
  }
  const row = existing.rows[0] as { id: string; role: string };
  if (row.id !== seed.id) {
    throw new Error(
      `Seed conflict: email ${seed.email} already belongs to a different user (id ${row.id}). ` +
        'Refusing to attach seed bookings to a mismatched account. ' +
        'Resolve it manually (delete or migrate that row) before re-running the seed.',
    );
  }
  await client.query(
    'UPDATE users SET password_hash = $2, role = $3, updated_at = now() WHERE id = $1',
    [seed.id, passwordHash, seed.role],
  );
  return seed.id;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error(
      'Missing required environment variable: DATABASE_URL ' +
        '(set it in apps/api/.env; see apps/api/.env.example)',
    );
  }

  const production = process.env.NODE_ENV === 'production';
  let adminPassword = LOCAL_ADMIN_PASSWORD;
  if (production) {
    // A strong supplied password is the authorization: no separate flag.
    const supplied = process.env.SEED_ADMIN_PASSWORD;
    if (!supplied || !isStrongPassword(supplied)) {
      throw new Error(
        'Production seeding requires SEED_ADMIN_PASSWORD with at least 12 characters, ' +
          'including uppercase, lowercase, and a digit. It is never logged.',
      );
    }
    // The supplied password is used for hashing only and never printed.
    adminPassword = supplied;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await upsertSeedUser(client, {
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      password: adminPassword,
      role: 'admin',
    });

    await client.query('COMMIT');
    console.log(`Admin seed complete: ${ADMIN_EMAIL} (password not logged).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed, rolled back:');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
