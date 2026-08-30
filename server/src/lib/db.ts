import pg from 'pg';

// BIGSERIAL ids arrive as strings by default because a 64-bit integer does not
// fit a JS number. Ours never exceed 2^53, and the client compares them as
// numbers, so parse INT8 back to a number rather than leaking strings into JSON.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

/**
 * Managed Postgres (Render, Railway, Neon, RDS…) requires TLS, and most of them
 * present a certificate Node will not verify against its default CA bundle.
 *
 *   unset / 'disable'  no TLS — a local socket, which is the default here
 *   'require'          TLS on, certificate not verified (what most hosts need)
 *   'verify'           TLS on and verified — use when you supply DATABASE_CA
 */
function sslOption(): pg.ConnectionConfig['ssl'] {
  const url = process.env.DATABASE_URL ?? '';
  const mode = (process.env.DATABASE_SSL ?? (/[?&]sslmode=require/.test(url) ? 'require' : 'disable'))
    .toLowerCase();

  if (mode === 'disable' || mode === 'false') return undefined;
  if (mode === 'verify') {
    const ca = process.env.DATABASE_CA;
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PGPOOL_MAX ?? 10),
  ssl: sslOption(),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a set of statements in a single transaction, rolling back on any throw. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
