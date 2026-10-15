import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { createAuthRouter } from './auth/routes.js';
import type { CookieConfig } from './auth/cookies.js';

export interface AppOptions {
  pool: Pool;
  frontendOrigin: string;
  cookie: CookieConfig;
}

export function createApp(options: AppOptions): express.Express {
  const { pool, frontendOrigin, cookie } = options;
  const app = express();

  // Cookies carry the session, so the browser must be allowed to send them —
  // but only to the single configured frontend origin, never '*'.
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter({ pool, cookie, frontendOrigin }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
