import './lib/env.js';
import { pool } from './lib/db.js';
import { applyMigrations } from './lib/migrations.js';

/**
 * Manual migration runner. The server also does this at boot, so this exists
 * for running migrations deliberately — against a restored backup, say, or to
 * check what is pending without starting the app.
 */
async function main(): Promise<void> {
  const applied = await applyMigrations();
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Nothing to apply.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
