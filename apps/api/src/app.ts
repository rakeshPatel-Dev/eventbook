import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

export function createApp(frontendOrigin: string): express.Express {
  const app = express();

  app.use(
    cors({
      origin: frontendOrigin,
    }),
  );
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

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
