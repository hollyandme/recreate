import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * One .env at the repo root serves both workspaces. Resolve it relative to this
 * file rather than to process.cwd(), because npm runs workspace scripts from
 * server/ while a plain `node dist/index.js` may run from anywhere.
 */
const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * The repo root, resolved from this file rather than from cwd. Anything on disk
 * that is configured with a relative path hangs off this, so `npm run dev`
 * (cwd server/) and `node dist/index.js` (cwd anywhere) agree on where it is.
 */
export const REPO_ROOT = path.resolve(here, '../../..');

config({ path: path.join(REPO_ROOT, '.env') });
