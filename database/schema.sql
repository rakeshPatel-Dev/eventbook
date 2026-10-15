-- EventBook PostgreSQL schema.
-- UUID keys use gen_random_uuid() (built into PostgreSQL 13+, no extension
-- needed). All foreign keys are ON DELETE RESTRICT so history is never
-- silently deleted. No triggers: writers set updated_at = now() on UPDATE.
-- Business rules split (schema vs. backend transactions) is in the README.

-- users
-- Email is stored lowercase: the CHECK rejects non-normalized values from
-- any client, so the UNIQUE constraint reliably allows one account per
-- address. password_hash holds a bcrypt hash, never plaintext. role can
-- only become 'admin' via this seed script or direct database access.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (
    email = lower(email)
    AND char_length(email) > 0
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) > 0),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- events
-- No constraint on starts_at: past events stay representable with their
-- real date. Blocking bookings on past events is a backend rule.
-- description is NOT NULL DEFAULT '' so readers never handle NULL.
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  venue TEXT NOT NULL CHECK (char_length(btrim(venue)) > 0),
  total_seats INTEGER NOT NULL CHECK (total_seats > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);

-- bookings: one row = one seat. Cancelling flips status, never deletes.
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One confirmed booking per (user, event). Cancelled rows are excluded, so
-- rebooking after cancellation is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_confirmed_per_user_event
  ON bookings (user_id, event_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS bookings_event_confirmed_idx
  ON bookings (event_id)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings (user_id);

-- sessions: server-managed logins. token_hash stores hex-encoded SHA-256
-- (64 chars); the raw token goes to an HttpOnly cookie and is never stored.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
