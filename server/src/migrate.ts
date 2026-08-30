import './lib/env.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, tx } from './lib/db.js';

/**
 * Apply every .sql file in migrations/ in filename order, once. Each runs inside
 * its own transaction alongside the row that records it, so a failed migration
 * leaves nothing half-applied and nothing falsely marked as done.
 */
async function main(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const dir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../migrations');
  const all = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));

  for (const name of all) {
    if (done.has(name)) {
      console.log(`· ${name} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(dir, name), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
    console.log(`✓ ${name}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
