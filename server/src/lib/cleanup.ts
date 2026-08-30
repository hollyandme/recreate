import { query } from './db.js';
import { storage } from './storage.js';

/**
 * Postgres cascades rows; it cannot cascade into object storage. Whenever a
 * delete is about to take shots with it, drop their screenshots first so the
 * bucket does not accumulate orphans.
 *
 * Storage failures are logged and swallowed: a stranded object is a cost
 * problem, a failed delete would be a correctness one.
 */
async function removeKeys(keys: (string | null)[]): Promise<void> {
  await Promise.all(
    keys
      .filter((k): k is string => !!k)
      .map((k) => storage.remove(k).catch((err) => console.error('storage delete failed', k, err))),
  );
}

export async function removeImagesForBrief(briefId: number): Promise<void> {
  const rows = await query<{ image_key: string | null }>(
    'SELECT image_key FROM shots WHERE brief_id = $1',
    [briefId],
  );
  await removeKeys(rows.map((r) => r.image_key));
}

export async function removeImagesForIdea(ideaId: number): Promise<void> {
  const rows = await query<{ image_key: string | null }>(
    `SELECT s.image_key FROM shots s
       JOIN briefs b ON b.id = s.brief_id
      WHERE b.idea_id = $1`,
    [ideaId],
  );
  await removeKeys(rows.map((r) => r.image_key));
}

export async function removeImageForShot(shotId: number): Promise<void> {
  const rows = await query<{ image_key: string | null }>(
    'SELECT image_key FROM shots WHERE id = $1',
    [shotId],
  );
  await removeKeys(rows.map((r) => r.image_key));
}
