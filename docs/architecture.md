# EventBook architecture

Foundation-stage constraints (must not be violated by later steps):

- `apps/web` is frontend only (Next.js App Router + TypeScript + Tailwind CSS).
- All application data access goes through the Express REST API (`apps/api`).
- Only the Express backend connects to Supabase PostgreSQL via `pg`.
- Do not use Next.js API routes, route handlers, server actions,
  Supabase Auth, or Supabase queries from the frontend.
- npm workspaces at the repository root (`apps/web`, `apps/api`).
- Keep dependencies minimal and TypeScript conventions consistent.

## Runtime topology (local dev)

- Web: `http://localhost:3000` (Next.js, `NEXT_PUBLIC_API_URL` points at the API).
- API: `http://localhost:4000` (Express, CORS allows `FRONTEND_ORIGIN` only).
- Database: Supabase PostgreSQL, reachable only from the API via `DATABASE_URL`.

## Backend conventions

- Env is loaded from the API app environment (`apps/api/.env`) and
  validated on startup (`src/config.ts`). Missing `DATABASE_URL` or
  `FRONTEND_ORIGIN` fails fast.
- `pg` connection pool is created in `src/db.ts`; no queries are
  implemented in the foundation.
- `GET /api/health` reports API liveness without touching the database.
- JSON parsing, 404 handler, and error handler are configured in `src/app.ts`.
- `src/index.ts` owns HTTP startup and graceful shutdown
  (closes the server, then drains the `pg` pool on `SIGINT`/`SIGTERM`).
