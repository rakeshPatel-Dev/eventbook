# EventBook

Full-stack event booking application (foundation). npm workspaces monorepo.

## Architecture

- `apps/web`: Next.js App Router + TypeScript + Tailwind CSS. Frontend only.
- `apps/api`: Express + TypeScript + `pg` connection pool. Sole database client.
- `database/schema.sql`: placeholder for the forthcoming PostgreSQL schema.
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
```

## Environment

| Variable              | App | Purpose                                                 |
| --------------------- | --- | ------------------------------------------------------- |
| `DATABASE_URL`        | api | Supabase Postgres connection string (backend only)      |
| `FRONTEND_ORIGIN`     | api | Exact allowed CORS origin, e.g. `http://localhost:3000` |
| `PORT`                | api | API port, default `4000`                                |
| `NEXT_PUBLIC_API_URL` | web | Public Express base URL, e.g. `http://localhost:4000`   |

Auth variables are reserved for a later step and not implemented here.
