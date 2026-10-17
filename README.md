# EventBook

A small event booking app: an **admin** publishes events with a fixed number of
seats, **visitors** browse them, and **registered users** book and cancel a
seat. Seats are never overbooked.

The frontend and backend are separate: the Next.js app talks only to my own
Express REST API, and only that API talks to PostgreSQL.

## Live links & test accounts

|         | URL                                          |
| ------- | -------------------------------------------- |
| Web app | https://eventbook.rakeshpatel.me             |
| API     | https://api-eventbook.rakeshpatel.me         |
| Repo    | https://github.com/rakeshPatel-Dev/eventbook |

Seeded logins (created by `npm run db:seed`, same on local and live):

| Role  | Email             | Password    |
| ----- | ----------------- | ----------- |
| admin | admin@example.com | `Admin123!` |
| user  | user@example.com  | `User1234!` |

These are throwaway demo credentials, not real secrets — they are seeded on
purpose so the reviewer can log straight in. `admin@example.com` can manage
events and see attendee lists; `user@example.com` has a couple of bookings to
play with.

## Tech stack and why

| Layer    | Choice                                     | Why                                                                                                                                                                       |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js App Router + TypeScript + Tailwind | Required by the brief; App Router keeps data loading in client components talking to the API, with no server-side DB access. Tailwind keeps styling local and consistent. |
| Backend  | Node.js + Express + TypeScript             | Required (Node option); minimal and explicit, so every route and middleware is visible.                                                                                   |
| Database | Supabase (PostgreSQL) via `pg`             | Required; `pg` with parameterized SQL instead of an ORM so the schema and the transactional rules are readable directly.                                                  |
| Auth     | Opaque session cookies (no JWT)            | Server-side sessions can be revoked on logout; JWTs cannot without extra state.                                                                                           |
| Tests    | Node's built-in `node:test`                | No extra dependencies; runs against a real PostgreSQL database.                                                                                                           |

## Repository layout

- `apps/web` — Next.js App Router + TypeScript + Tailwind. Frontend only.
- `apps/api` — Express + TypeScript, the sole database client.
  - `src/auth/` — sessions, cookies, password hashing, validation, middleware.
  - `src/events/`, `src/bookings/` — event and booking routes.
  - `src/db/pool.ts`, `src/db/apply-schema.ts` — pool factory and `db:init`.
  - `src/test/helper.ts` — shared integration-test harness.
- `database/schema.sql` — the full schema.
- `database/seed.ts` — repeatable seed (`npm run db:seed`).
- `docs/` — brief, architecture notes, build phases, security analysis.

No Next.js API routes, route handlers, or server actions are used as the
backend, and the frontend never queries PostgreSQL directly.

## Run locally

Prerequisites: Node.js >= 20, npm, and a PostgreSQL database (local or a free
Supabase project).

```bash
npm install
cp .env.example apps/api/.env            # then edit DATABASE_URL, FRONTEND_ORIGIN
cp apps/web/.env.example apps/web/.env.local

npm run db:init                          # apply database/schema.sql
npm run db:seed                          # admin + demo user + sample events/bookings

npm run dev:api                          # Express on http://localhost:4000
npm run dev:web                          # Next.js on http://localhost:3000
```

Checks:

```bash
npm run format:check                     # prettier
npm run typecheck                        # tsc --noEmit in both apps
npm run build                            # next build + tsc build
npm test                                 # backend tests (needs TEST_DATABASE_URL)
```

Tests need their own database — they create the schema and truncate tables
between cases, so never point them at real data:

```bash
createdb eventbook_test
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/eventbook_test npm test
```

## Data model

Only the Express API touches PostgreSQL, using parameterized queries.

| Table      | Purpose                                                 | Key constraints                                                                                           |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `users`    | accounts; `role` is `user` or `admin`                   | UUID PK; lowercase-checked unique `email`; bcrypt `password_hash`                                         |
| `events`   | published events; past dates allowed                    | UUID PK; non-empty `title`/`venue`; `total_seats > 0`; index on `starts_at`                               |
| `bookings` | one row = one seat; cancel flips status, never deletes  | UUID PK; FKs to users/events `ON DELETE RESTRICT`; partial unique `(user_id, event_id)` where `confirmed` |
| `sessions` | server-managed logins; stores SHA-256 hash of the token | UUID PK; FK to users `ON DELETE RESTRICT`; unique `token_hash`; indexes on `expires_at`, `user_id`        |

Foreign keys are `ON DELETE RESTRICT` everywhere, so history is never silently
deleted (this is why an event with bookings cannot be deleted). `seats left` is
always **derived**: `total_seats` minus the count of confirmed bookings — it is
never stored, so it cannot drift.

## API

All responses are JSON and errors are `{ "error": "..." }`.

```bash
POST /api/auth/register        # {email, password} → 201 {user}, sets cookie; duplicate → 409
POST /api/auth/login           # {email, password} → 200 {user}, sets cookie
POST /api/auth/logout          # revokes session, clears cookie
GET  /api/auth/me              # → 200 {user} or 401

GET  /api/events?search=&page=&limit=   # public, upcoming only; server-side pagination
GET  /api/events/:id                    # public, any event incl. past
GET  /api/events/:id/attendees          # admin: confirmed bookings + emails
POST /api/events                        # admin: create
PATCH /api/events/:id                   # admin: update; seats below confirmed → 409
DELETE /api/events/:id                  # admin: 409 when booking history exists

POST /api/bookings                      # auth: {event_id} → 201; double/full/past → 409
GET  /api/bookings/mine                 # auth: own bookings with event facts
POST /api/bookings/:id/cancel           # auth: own confirmed booking on a future event
```

## Decisions & trade-offs

**Never overbooking.** The count is `SELECT ... FOR UPDATE` on the event row
inside a transaction, then the booking is inserted, then the transaction
commits. Two simultaneous requests for the last seat serialize on the row lock,
so exactly one succeeds (there is a test for this). The partial unique index
`(user_id, event_id) WHERE status = 'confirmed'` is a second line of defence for
the "same event twice" rule. A unique index alone could not stop overbooking —
the check and the insert must share one locked transaction.

**Cancelling is a status flip, not a delete.** `bookings.status` moves from
`confirmed` to `cancelled`, which frees the seat (seats-left counts only
confirmed rows) and allows rebooking, while keeping the audit trail. Cancelling
a booking on a past event is refused.

**Business rules split.** PostgreSQL enforces invariants that must hold for any
writer (one confirmed booking per user/event, positive seats, valid
roles/statuses, lowercase unique emails, hashed-only tokens). The backend
enforces the rules that need a transaction (no overbooking, capacity not below
confirmed count, no booking/cancelling past events, cancel your own only).
Every rule is enforced server-side; the UI only mirrors it for a nicer
experience.

**Sessions over JWTs.** 256-bit opaque tokens, only their SHA-256 hash stored,
delivered in an `HttpOnly` cookie (`Secure` in production). Logout deletes the
row, so revocation is immediate. Passwords use bcrypt.

**Other choices.** Server-side pagination (the frontend never slices a full
list); a single `{ "error": "..." }` shape with correct status codes and no
stack traces; the seed is idempotent (fixed ids + upserts) so it can be re-run
safely; test-account credentials are intentionally public per the brief.

## Security

- Passwords hashed with bcrypt; session tokens stored only as SHA-256 hashes.
- Protected routes verify the live session on every request; admin routes check
  `role` from the database, never from the client.
- `helmet` security headers; JSON bodies capped at 16kb.
- Login/register are rate-limited (20 attempts / 15 min).
- Mutating event and booking routes require an `X-Requested-With` header, and
  auth routes check `Origin` against `FRONTEND_ORIGIN` (CSRF hardening on top of
  `SameSite` cookies).
- CORS allows credentials for the exact `FRONTEND_ORIGIN` only, never `*`.
- Secrets live only in environment variables. `.env` is git-ignored;
  `.env.example` is committed.

## Environment

| Variable              | App | Purpose                                                                  |
| --------------------- | --- | ------------------------------------------------------------------------ |
| `DATABASE_URL`        | api | PostgreSQL (Supabase) connection string; backend only                    |
| `FRONTEND_ORIGIN`     | api | Exact allowed CORS origin, e.g. `http://localhost:3000`                  |
| `COOKIE_SAMESITE`     | api | `lax` (default), `strict`, or `none` (cross-site prod only, needs HTTPS) |
| `NODE_ENV`            | api | `production` enables `Secure` cookies                                    |
| `PORT`                | api | API port, default `4000`                                                 |
| `SEED_ADMIN_PASSWORD` | api | Optional override for the seeded admin password                          |
| `NEXT_PUBLIC_API_URL` | web | Public Express base URL, e.g. `http://localhost:4000`                    |

## Deploy (Supabase + Render + Vercel)

Three pieces: **Supabase** (PostgreSQL), **Render** (Express API), **Vercel**
(Next.js web app). `render.yaml` is a blueprint for the API service.

1. **Database (Supabase).** Create a project and copy its **connection pooler**
   string (Connect → Session pooler), not the direct connection. Direct
   connections (`db.<ref>.supabase.co`) are IPv6-only, and IPv4-only hosts such
   as Render cannot reach them (`ENETUNREACH`). Append `?sslmode=no-verify` —
   Supabase's root CA is self-signed, so Node rejects `sslmode=require`
   (`SELF_SIGNED_CERT_IN_CHAIN`). Apply the schema and seed it once:

   ```bash
   export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=no-verify'
   npm run db:init
   npm run db:seed
   ```

2. **API (Render).** New → Blueprint → select this repo (`render.yaml` is picked
   up). In the dashboard set `DATABASE_URL` (the pooler string above) and `FRONTEND_ORIGIN` (the
   Vercel URL, e.g. `https://eventbook.vercel.app`). The blueprint already sets
   `NODE_ENV=production` and `COOKIE_SAMESITE=none`; health check is
   `/api/health`. The free plan sleeps when idle, so the first request after a
   pause can take ~30s — expected, not a bug.

3. **Web (Vercel).** Import the repo, set **Root Directory** to `apps/web`, and
   add `NEXT_PUBLIC_API_URL=https://<your-api>.onrender.com`. Deploy.
   (`apps/web/vercel.json` pins the framework and adds security headers; the
   Root Directory is the setting that matters for this monorepo.)

4. **Verify.** Run the brief's self-check on the live site: register/login/book/
   cancel, double-book, full, past, admin-only APIs, search and pagination.

The web app and API are on different sites, so the session cookie is
`SameSite=None; Secure`; browsers only accept that over HTTPS, which Vercel and
Render provide by default. The live database is seeded with the same
`npm run db:seed`, so the test accounts above work there too.

## AI usage

I used two AI tools, in different roles:

- **OpenCode** (an AI coding agent) for the bulk of the implementation: it
  helped scaffold the Express/Next.js structure, draft the route handlers and
  middleware, suggest the `SELECT ... FOR UPDATE` transaction for the booking
  rules, write the integration tests, and draft this README. I reviewed, ran
  and debugged every change, and I can explain each file.
- **Agent** (Cursor CLI) for the security pass: reviewing the auth, session
  and booking code for issues, which produced `docs/security-analysis.md`.

## Known issues / next steps

- **Deployment.** The live links at the top are the last step. The API and web
  app are deployed separately; the free API tier may sleep, so the first request
  can take a few seconds.
- **Docker Compose** for local development is not set up (a bonus item).
- **Concurrency** is implemented and covered by a test (two requests for the
  last seat), and explained under "Decisions & trade-offs".
- **Rate limiting** is applied to login/register; other endpoints are not
  limited.
- The seeded demo credentials are public by design (see above); a real product
  would rotate them.

## Self-check (from the brief)

Verified against the live deployment with a 53-check API suite (all pass):

- [x] Register, login, book and cancel work on the live site.
- [x] Booking twice, a full event, and a past event each fail with a clear message.
- [x] Admin APIs reject a normal user (verified with tests + Postman, and live).
- [x] Search and pagination work live.
- [x] `.env` is not committed, and tests pass with one command.
