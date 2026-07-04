import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from './config';

// Hosted Postgres (Supabase, etc.) requires SSL; local Postgres does not.
// Decide from the host rather than NODE_ENV so `npm run dev` against Supabase works.
function sslFor(url: string) {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /@(localhost|127\.0\.0\.1)$/.test(url);
  return isLocal ? undefined : { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: sslFor(config.databaseUrl),
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected idle Postgres client error', err);
});

export function query<T extends QueryResultRow = any>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}

/** Run a function inside a transaction, committing on success, rolling back on throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
