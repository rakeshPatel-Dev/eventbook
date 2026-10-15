import dotenv from 'dotenv';

dotenv.config();

export interface ApiConfig {
  port: number;
  databaseUrl: string;
  frontendOrigin: string;
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

export function loadConfig(): ApiConfig {
  return {
    port: parsePort(process.env.PORT),
    databaseUrl: requireEnv('DATABASE_URL'),
    frontendOrigin: requireEnv('FRONTEND_ORIGIN'),
  };
}
