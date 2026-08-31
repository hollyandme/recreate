import './lib/env.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { pool } from './lib/db.js';
import { errorHandler } from './lib/http.js';
import { tags } from './routes/tags.js';
import { ideas } from './routes/ideas.js';
import { briefs } from './routes/briefs.js';
import { shots } from './routes/shots.js';
import { files } from './routes/files.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// In dev the client runs on Vite's own port and proxies /api across; in
// production it is served from here and same-origin, so CORS is dev-only.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
}

app.use(express.json({ limit: '1mb' }));

/**
 * Health check. Deliberately queries a real table rather than returning a
 * constant: the host uses this to decide whether a deploy succeeded, and a
 * process that booted with an unreachable or unmigrated database is not
 * healthy — it just fails on the first click instead of at deploy time.
 */
/**
 * Which commit is actually running. Hosts inject this; without it there is no
 * way to tell a deployed version from the outside, which turns "did my push go
 * out?" into dashboard archaeology.
 */
const COMMIT = (
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.RENDER_GIT_COMMIT ??
  process.env.GIT_COMMIT ??
  'unknown'
).slice(0, 7);

/** Migrations this build ships with; compared against what the database has. */
const SHIPPED_MIGRATIONS = readdirSync(
  path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../migrations'),
).filter((f) => f.endsWith('.sql'));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1 FROM ideas LIMIT 1');

    // Code shipping ahead of its schema is the dangerous case: the tables exist,
    // so the app boots and looks fine, then every query touching a new column
    // fails. Comparing shipped migrations against applied ones catches it at
    // deploy time instead of on the user's first click.
    const applied = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
    const have = new Set(applied.rows.map((r) => r.name));
    const pending = SHIPPED_MIGRATIONS.filter((m) => !have.has(m));

    if (pending.length) {
      res.status(503).json({
        ok: false,
        commit: COMMIT,
        error: `migrations pending: ${pending.join(', ')} — run npm run migrate:prod`,
      });
      return;
    }

    res.json({ ok: true, commit: COMMIT });
  } catch (err) {
    const code = (err as { code?: string }).code;
    res.status(503).json({
      ok: false,
      commit: COMMIT,
      error:
        code === '42P01'
          ? 'database has no tables — migrations have not run'
          : 'database unreachable',
    });
  }
});

app.use('/api/tags', tags);
app.use('/api/ideas', ideas);
app.use('/api/briefs', briefs);
app.use('/api/shots', shots);
app.use('/api/files', files);

// Production: serve the built client and let the router own every non-API path,
// so a deep link to /briefs/7/print survives a hard refresh.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
  app.use(express.static(dist));
  app.get('/*path', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Recreate API listening on http://localhost:${PORT}`);
});
