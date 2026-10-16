# EventBook build phases

Source of truth for what is done, what is next, and what is deliberately
deferred. Derived from `intern_project_brief.md` (deadline: Sunday 18
October 2026, 6:00 PM NPT; effort 10–14 hours; "correct, clean and deployed,
not big"). Priority order per the brief: login → booking rules → admin event
management → frontend polish. Biggest evaluation weight: works correctly on
the live site.

## Done

### Phase 0 — Foundation and database

- [x] npm workspaces monorepo (`apps/web`, `apps/api`), Prettier, TS strict.
- [x] PostgreSQL schema (`database/schema.sql`): `users`, `events`, `bookings`,
      `sessions`. Partial unique index for one confirmed booking per user/event,
      `ON DELETE RESTRICT` everywhere, no triggers, no ORM.
- [x] Repeatable seed (`database/seed.ts`, `ALLOW_DEMO_SEED=true`): admin +
      demo user, 4 events (plenty, nearly full, other venue, past), 7 bookings
      with cancel/rebook chronology. Production path bootstraps the admin only
      with a strong `SEED_ADMIN_PASSWORD`, never logged.

### Phase 1 — Auth backend + minimal auth frontend

- [x] Opaque 256-bit sessions, `HttpOnly` cookie (`eventbook_session`, 7 days,
      `Secure` in production, configurable `SameSite`), SHA-256 hashes only in
      PostgreSQL, bcrypt cost 10.
- [x] `POST /api/auth/register` (auto-login, role always `user`, 409 on
      duplicates), `POST /api/auth/login` (generic 401), `POST /api/auth/logout`
      (revokes + clears, safe without session), `GET /api/auth/me` (401/200).
- [x] `requireAuth` / `requireAdmin` / `requireSameOrigin`; CORS credentials for
      `FRONTEND_ORIGIN` only.
- [x] 10 backend tests (`node:test`, real DB). Login/register pages, session
      state, logout button; no browser storage for tokens.

### Phase 2 — Event and booking APIs

- [x] `GET /api/events` (upcoming only, search, server pagination, derived
      `seatsLeft`), `GET /api/events/:id` (any event), admin CRUD plus
      `GET /:id/attendees` (confirmed + emails).
- [x] `POST /api/bookings` in `SELECT ... FOR UPDATE` transactions
      (404 → past → double → full, all 409 with clear messages),
      `GET /api/bookings/mine`, `POST /api/bookings/:id/cancel` (own, confirmed,
      future events; status flip, never delete).
- [x] 13 more backend tests (23 total), including two concurrent last-seat
      requests resolving to exactly one 201 + one 409.

## Next

### Phase 3 — Visitor and user frontend

- [x] Event list with search + server pagination, event detail with seats left,
      book/cancel buttons with clear failure messages ("event is full"),
      my-bookings page.
- [x] Loading, error, and empty states everywhere; usable on a phone.
- [x] No new auth work; all data through the REST API with
      `credentials: 'include'`.

### Phase 4 — Admin frontend

- [x] Admin-gated create/edit/delete event UI and per-event attendee list.
- [x] Reuse Phase 3 components; gate on `role` from `/me` (backend already
      enforces it — UI gating is convenience, not security).

### Phase 5 — Deploy early, then verify live (compulsory)

- [ ] Supabase project → `db:init` + production seed (admin only) → API on
      Render/Railway → web on Vercel (`COOKIE_SAMESITE=none`, `NODE_ENV`
      production for `Secure`, exact public `FRONTEND_ORIGIN`, HTTPS both sides).
- [ ] Run the brief's live self-check: register/login/book/cancel, double-book,
      full, and past failures, non-admin rejected on admin APIs, search and
      pagination. Fix what breaks live; note backend sleep behavior in README.

### Phase 6 — Final polish

- [ ] README in own words: live links, credentials, stack + why, run/seed/test,
      data model, API sketch, trade-offs, AI usage, known issues over fake
      completeness.
- [ ] Final green run: `format`, `typecheck`, `build`, `test`. Small meaningful
      commits throughout (no giant dumps).

## Deferred (bonus only, after everything above is live)

- [ ] Concurrency write-up (already implemented + tested; document it).
- [ ] Docker Compose, login rate limiting.
