/**
 * Minimal forward-only migration runner: applies every .sql file in /migrations
 * in lexical order, tracking applied files in a _migrations table.
 *   Run: npx ts-node scripts/migrate.ts
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL ?? '';
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  for (const file of files) {
    const done = await pool.query(`SELECT 1 FROM _migrations WHERE name = $1`, [file]);
    if (done.rows.length) {
      console.log(`· skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ apply ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO _migrations(name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  console.log('migrations complete');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
