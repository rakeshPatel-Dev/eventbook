# EventBook

Full-stack event booking application (foundation). npm workspaces monorepo.

## Architecture

- `apps/web`: Next.js App Router + TypeScript + Tailwind CSS. Frontend only.
- `apps/api`: Express + TypeScript + `pg` connection pool. Sole database client.
- `apps/api/src/db/pool.ts`: PostgreSQL connection-pool factory.
- `apps/api/src/db/apply-schema.ts`: applies `database/schema.sql` (`npm run db:init`).
- `database/schema.sql`: full PostgreSQL schema (users, events, bookings, sessions).
- `database/seed.ts`: repeatable development seed (`npm run db:seed`).
- `docs/architecture.md`: enforced constraints and runtime topology.

All data access goes through the Express REST API. The frontend never
connects to the database. No Next.js API routes, route handlers, server
actions, or Supabase usage from the frontend.

## Prerequisites

- Node.js >= 20
- npm
- Supabase PostgreSQL connection string (backend only)

## Setup

```bash
npm install
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit apps/api/.env (DATABASE_URL, FRONTEND_ORIGIN) — no real secrets in repo.
```

## Run

```bash
npm run dev:api   # Express on http://localhost:4000, GET /api/health
npm run dev:web   # Next.js on http://localhost:3000
```

## Checks

```bash
npm run typecheck       # tsc --noEmit in both apps
npm run build           # next build + tsc build
npm run build:web
npm run build:api
npm run typecheck:web
npm run typecheck:api
npm run format:check    # prettier check (no changes)
```

## Database

Only the Express backend talks to PostgreSQL, using `pg` with parameterized
queries (no ORM). The frontend never sees `DATABASE_URL`.

Tables and relationships:

| Table      | Purpose                                                 | Key constraints                                                                                           |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `users`    | accounts; `role` is `user` or `admin`                   | UUID PK; lowercase-checked unique `email`; bcrypt `password_hash`                                         |
| `events`   | published events; past dates allowed                    | UUID PK; non-empty `title`/`venue`; `total_seats > 0`; index on `starts_at`                               |
| `bookings` | one row = one seat; cancel = status flip, never delete  | UUID PK; FKs to users/events `ON DELETE RESTRICT`; partial unique `(user_id, event_id)` where `confirmed` |
| `sessions` | server-managed logins; stores SHA-256 hex of token only | UUID PK; FK to users `ON DELETE RESTRICT`; unique `token_hash`; indexes on `expires_at`, `user_id`        |

Configure `DATABASE_URL` in `apps/api/.env` (see `apps/api/.env.example`).
For Supabase, use the project connection string and keep `?sslmode=require`
if your client does not enable SSL by default. No Supabase dashboard setup is
needed beyond creating the project and copying its connection string; the
schema needs no extensions (`gen_random_uuid()` is built in).

Initialize and seed:

```bash
npm run db:init                    # apply database/schema.sql (repeatable, fails clearly on error)
ALLOW_DEMO_SEED=true npm run db:seed  # insert development data (explicit opt-in, repeatable)
```

Local development accounts (**local development only, never production**):

| Role  | Email             | Password    |
| ----- | ----------------- | ----------- |
| admin | admin@example.com | `Admin123!` |
| user  | user@example.com  | `User1234!` |

Only the admin is created by privilege: registration (a later stage) must
never accept `role='admin'`. The demo user exists so ownership and
authorization can be tested (each holds bookings the other must not touch).

Production seeding is a separate path: with `NODE_ENV=production` it requires
both `ALLOW_PRODUCTION_SEED=true` and a strong `SEED_ADMIN_PASSWORD` (min 12
chars, upper/lowercase + digit), bootstraps the admin only with no demo data,
and never logs the password. The local credentials above must never be used
in production.

Seed events (dates are relative to seed time): an upcoming 200-seat meetup,
an upcoming 3-seat workshop that is nearly full (2 confirmed, 1 seat left),
an upcoming concert at another venue, and a past event with a historical
booking. Seed bookings demonstrate confirmed and cancelled statuses,
including a cancelled-then-rebooked pair with explicit chronology (older
cancelled `created_at`, newer confirmed `created_at`). Every seed run ends
with an integrity check that fails if any event's capacity sits below its
confirmed bookings; the whole seed is one atomic transaction.

Event deletion policy: events with any booking history (even cancelled) and
users with bookings/sessions cannot be deleted (`ON DELETE RESTRICT`). The
API stage will turn that into a clear error. Sessions are deleted on logout
or by expiry cleanup.

Rule split — enforced by PostgreSQL vs. backend transactions (later stage):

- PostgreSQL: one confirmed booking per user/event, positive seats, valid
  roles/statuses, lowercase unique emails, hashed-only session tokens,
  no silent history deletion.
- Backend transactions (row-level `SELECT ... FOR UPDATE` on the event):
  no overbooking under concurrency, capacity never below confirmed count,
  no booking/cancelling past events, users cancel only their own bookings.
  A unique index alone cannot prevent overbooking — the check-and-insert
  must happen inside one locked transaction.

## Environment

| Variable              | App | Purpose                                                 |
| --------------------- | --- | ------------------------------------------------------- |
| `DATABASE_URL`        | api | Supabase Postgres connection string (backend only)      |
| `FRONTEND_ORIGIN`     | api | Exact allowed CORS origin, e.g. `http://localhost:3000` |
| `PORT`                | api | API port, default `4000`                                |
| `NEXT_PUBLIC_API_URL` | web | Public Express base URL, e.g. `http://localhost:4000`   |

Login/logout endpoints and auth middleware belong to a later stage; only the
`sessions` table exists so far. No secrets are committed (`.env` is ignored).
