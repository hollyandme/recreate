import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

/**
 * Apply pending migrations.
 *
 * This runs at boot rather than relying on a release hook. A hook that silently
 * does not fire leaves the code ahead of its schema, and the app then dies on
 * every request to the affected route — which also means it dies too fast to
 * open a shell and fix by hand. Migrating in-process makes a deploy
 * self-contained: it cannot start serving against a schema it does not match.
 *
 * An advisory lock keeps concurrent instances from racing; the others wait,
 * then find nothing to do.
 */
const LOCK_KEY = 8_140_233_907_115_442; // arbitrary, stable, app-specific

export const MIGRATIONS_DIR = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../migrations',
);

export async function listShipped(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

export async function applyMigrations(log: (m: string) => void = console.log): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );

    for (const name of await listShipped()) {
      if (done.has(name)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
      // Each migration and its bookkeeping row commit together, so a failure
      // leaves nothing half-applied and nothing falsely marked as done.
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      applied.push(name);
      log(`✓ ${name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}
