import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';

// Repeatable seed for EventBook.
// Usage: npm run db:seed (runs from apps/api).
// Seeds the admin plus one demo user, four events (plenty of seats, nearly
// full, another venue, and a past event) and a handful of bookings that
// exercise the rules (cancel-then-rebook, ownership contrast, history).
// Fixed ids make every write an upsert, so re-running never duplicates.
// The same seed runs locally and on the live database so reviewers can log
// in with the test accounts documented in the README. No sessions are
// created. Set SEED_ADMIN_PASSWORD to use a different admin password.

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), 'apps/api/.env') });
}

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin123!';
const USER_EMAIL = 'user@example.com';
const USER_PASSWORD = 'User1234!';

// Fixed ids keep the seed idempotent (upserts match on these).
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const EVENT_PLENTY_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_NEARLY_FULL_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_OTHER_ID = '55555555-5555-4555-8555-555555555555';
const EVENT_PAST_ID = '66666666-6666-4666-8666-666666666666';

interface SeedBooking {
  id: string;
  userId: string;
  eventId: string;
  status: 'confirmed' | 'cancelled';
  /** Age of the booking in days; older cancelled rows precede newer confirmed ones. */
  createdDaysAgo: number;
}

const BOOKINGS: SeedBooking[] = [
  // Cancel/rebook pair, inserted oldest first: the older cancelled booking
  // precedes the newer confirmed one for the same user and event.
  {
    id: 'a2a2a2a2-2222-4222-8222-aaaaaaaaaaa2',
    userId: ADMIN_ID,
    eventId: EVENT_PLENTY_ID,
    status: 'cancelled',
    createdDaysAgo: 10,
  },
  {
    id: 'a1a1a1a1-1111-4111-8111-aaaaaaaaaaa1',
    userId: ADMIN_ID,
    eventId: EVENT_PLENTY_ID,
    status: 'confirmed',
    createdDaysAgo: 2,
  },
  // Nearly-full event: 2 of 3 seats taken, 1 left.
  {
    id: 'a3a3a3a3-3333-4333-8333-aaaaaaaaaaa3',
    userId: ADMIN_ID,
    eventId: EVENT_NEARLY_FULL_ID,
    status: 'confirmed',
    createdDaysAgo: 5,
  },
  {
    id: 'a4a4a4a4-4444-4444-8444-aaaaaaaaaaa4',
    userId: USER_ID,
    eventId: EVENT_NEARLY_FULL_ID,
    status: 'confirmed',
    createdDaysAgo: 4,
  },
  // Ownership contrast: a different user confirmed on the same event.
  {
    id: 'a5a5a5a5-5555-4555-8555-aaaaaaaaaaa5',
    userId: USER_ID,
    eventId: EVENT_PLENTY_ID,
    status: 'confirmed',
    createdDaysAgo: 3,
  },
  {
    id: 'a6a6a6a6-6666-4666-8666-aaaaaaaaaaa6',
    userId: USER_ID,
    eventId: EVENT_OTHER_ID,
    status: 'cancelled',
    createdDaysAgo: 6,
  },
  // Historical booking on the past event (inserted directly, as history).
  {
    id: 'a7a7a7a7-7777-4777-8777-aaaaaaaaaaa7',
    userId: ADMIN_ID,
    eventId: EVENT_PAST_ID,
    status: 'confirmed',
    createdDaysAgo: 40,
  },
];

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

interface SeedUser {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

// Inserts the seed user or refreshes its credentials. Fails loudly when the
// email is corrupted across rows, so we never attach seed bookings to the
// wrong account.
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

async function seedEvents(client: PoolClient): Promise<void> {
  const events = [
    {
      id: EVENT_PLENTY_ID,
      title: 'Next.js Community Meetup',
      description: 'Monthly meetup: talks, demos, and networking for web developers.',
      startsAt: daysFromNowIso(30),
      venue: 'Kathmandu Tech Hub',
      totalSeats: 200,
    },
    {
      id: EVENT_NEARLY_FULL_ID,
      title: 'React Workshop: Hooks in Practice',
      description: 'Hands-on evening workshop. Bring a laptop.',
      startsAt: daysFromNowIso(14),
      venue: 'Lalitpur Innovation Center',
      totalSeats: 3,
    },
    {
      id: EVENT_OTHER_ID,
      title: 'Evening Jazz Concert',
      description: 'Live jazz by the lakeside.',
      startsAt: daysFromNowIso(60),
      venue: 'Pokhara Lakeside Amphitheater',
      totalSeats: 50,
    },
    {
      id: EVENT_PAST_ID,
      title: 'Intro to TypeScript (Archived)',
      description: 'Past beginner session, kept for history.',
      startsAt: daysFromNowIso(-30),
      venue: 'Kathmandu Tech Hub',
      totalSeats: 100,
    },
  ];
  for (const event of events) {
    await client.query(
      `INSERT INTO events (id, title, description, starts_at, venue, total_seats)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           starts_at = EXCLUDED.starts_at,
           venue = EXCLUDED.venue,
           total_seats = EXCLUDED.total_seats,
           updated_at = now()`,
      [event.id, event.title, event.description, event.startsAt, event.venue, event.totalSeats],
    );
  }
}

async function seedBookings(client: PoolClient, bookings: SeedBooking[]): Promise<void> {
  for (const booking of bookings) {
    try {
      await client.query(
        `INSERT INTO bookings (id, user_id, event_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             created_at = EXCLUDED.created_at,
             updated_at = now()`,
        [
          booking.id,
          booking.userId,
          booking.eventId,
          booking.status,
          daysAgoIso(booking.createdDaysAgo),
        ],
      );
    } catch (err) {
      throw toBookingConflictError(err, booking);
    }
  }
}

// Translates a partial-unique-index violation into an actionable message.
// Any other error is rethrown unchanged; the caller rolls the transaction back.
function toBookingConflictError(err: unknown, booking: SeedBooking): Error {
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr.code === '23505' && pgErr.constraint === 'bookings_one_confirmed_per_user_event') {
    return new Error(
      `Seed booking conflict: another confirmed booking already exists for user ${booking.userId} ` +
        `on event ${booking.eventId} under a different booking id (seed row ${booking.id} not applied). ` +
        'Cancel or remove the existing confirmed booking before re-running the seed.',
    );
  }
  return err as Error;
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
  // Optional override so a real deployment can pick its own admin password.
  // The default is the documented test account and is fine for this project.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || ADMIN_PASSWORD;

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminId = await upsertSeedUser(client, {
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      password: adminPassword,
      role: 'admin',
    });
    const userId = await upsertSeedUser(client, {
      id: USER_ID,
      email: USER_EMAIL,
      password: USER_PASSWORD,
      role: 'user',
    });

    await seedEvents(client);
    await seedBookings(
      client,
      BOOKINGS.map((booking) => ({
        ...booking,
        userId: booking.userId === ADMIN_ID ? adminId : userId,
      })),
    );

    await client.query('COMMIT');

    const counts = await client.query(
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT count(*) FROM events) AS events,
              (SELECT count(*) FROM bookings) AS bookings,
              (SELECT count(*) FROM bookings WHERE status = 'confirmed') AS confirmed,
              (SELECT count(*) FROM bookings WHERE status = 'cancelled') AS cancelled`,
    );
    console.log('Seed complete:', counts.rows[0]);
    console.log(`Admin: ${ADMIN_EMAIL}`);
    console.log(`User:  ${USER_EMAIL}`);
    if (!production) {
      // Test credentials are public (documented in the README); avoid printing
      // them into production logs.
      console.log(
        `Local test accounts: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}, ${USER_EMAIL} / ${USER_PASSWORD}`,
      );
    }
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
