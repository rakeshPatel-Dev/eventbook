import dotenv from 'dotenv';

dotenv.config();

export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface ApiConfig {
  port: number;
  databaseUrl: string;
  frontendOrigin: string;
  cookieSameSite: CookieSameSite;
  isProduction: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (!value || value.trim() === '') {
    return 4000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Invalid PORT: must be an integer between 1 and 65535');
  }
  return port;
}

function parseCookieSameSite(value: string | undefined): CookieSameSite {
  if (!value || value.trim() === '') {
    return 'lax';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  throw new Error('Invalid COOKIE_SAMESITE: must be one of lax, strict, none');
}

export function loadConfig(): ApiConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieSameSite = parseCookieSameSite(process.env.COOKIE_SAMESITE);
  if (cookieSameSite === 'none' && !isProduction) {
    throw new Error(
      'Invalid COOKIE_SAMESITE=none without production: SameSite=None requires Secure cookies, ' +
        'which browsers reject over plain HTTP. Use lax locally.',
    );
  }
  return {
    port: parsePort(process.env.PORT),
    databaseUrl: requireEnv('DATABASE_URL'),
    frontendOrigin: requireEnv('FRONTEND_ORIGIN'),
    cookieSameSite,
    isProduction,
  };
}
