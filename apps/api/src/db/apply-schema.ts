import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

// Applies database/schema.sql to the PostgreSQL database in DATABASE_URL.
// Usage: npm run db:init --workspace=apps/api
// Fails fast with a clear error; never swallows database errors.

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: resolve(process.cwd(), 'apps/api/.env') });
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value || value.trim() === '') {
    throw new Error(
      'Missing required environment variable: DATABASE_URL ' +
        '(set it in apps/api/.env; see apps/api/.env.example)',
    );
  }
  return value;
}

function findSchemaFile(): string {
  const candidates = [
    resolve(process.cwd(), 'database/schema.sql'), // run from repo root
    resolve(process.cwd(), '../../database/schema.sql'), // run from apps/api
    resolve(__dirname, '../../../database/schema.sql'), // relative to this file
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Could not find database/schema.sql (tried: ${candidates.join(', ')})`);
}

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const schemaPath = findSchemaFile();
  const schemaSql = readFileSync(schemaPath, 'utf8');

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(schemaSql);
    console.log(`Schema applied successfully from ${schemaPath}`);
  } catch (err) {
    console.error('Failed to apply database schema:');
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
