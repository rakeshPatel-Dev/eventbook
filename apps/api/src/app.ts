import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { createAuthRouter } from './auth/routes.js';
import { createBookingsRouter } from './bookings/routes.js';
import { createEventsRouter } from './events/routes.js';
import type { CookieConfig } from './auth/cookies.js';

export interface AppOptions {
  pool: Pool;
  frontendOrigin: string;
  cookie: CookieConfig;
}

export function createApp(options: AppOptions): express.Express {
  const { pool, frontendOrigin, cookie } = options;
  const app = express();

  // Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
  app.use(helmet());

  // Cookies carry the session, so the browser must be allowed to send them —
  // but only to the single configured frontend origin, never '*'.
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter({ pool, cookie, frontendOrigin }));
  app.use('/api/events', createEventsRouter({ pool, frontendOrigin }));
  app.use('/api/bookings', createBookingsRouter({ pool, frontendOrigin }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    // express.json() marks its own parse failures with status 400; those are
    // client errors, everything else is an internal failure.
    if ((err as { status?: unknown }).status === 400) {
      res.status(400).json({ error: 'Invalid JSON in request body.' });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
