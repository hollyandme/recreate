import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../lib/db.js';
import { h, idParam, HttpError } from '../lib/http.js';

export const tags = Router();

const NameBody = z.object({ name: z.string().trim().min(1).max(64) });

/**
 * Every tag, with how many ideas currently carry it.
 *
 * Ordered by creation, not alphabetically: the chip row is a library the team
 * builds up, and a newly created tag appearing at the end is what they expect.
 */
tags.get(
  '/',
  h(async (_req, res) => {
    const rows = await query<{ id: number; name: string; idea_count: number }>(
      `SELECT t.id, t.name, COUNT(it.idea_id)::int AS idea_count
         FROM tags t
         LEFT JOIN idea_tags it ON it.tag_id = t.id
        GROUP BY t.id
        ORDER BY t.id`,
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, ideaCount: r.idea_count })));
  }),
);

/**
 * Create a tag, or hand back the one that already exists under that name.
 * "hook" and "Hook" are the same tag, so this is idempotent rather than a 409 —
 * the UI's create-and-add field calls it freely.
 */
tags.post(
  '/',
  h(async (req, res) => {
    const { name } = NameBody.parse(req.body);
    const existing = await one<{ id: number; name: string }>(
      'SELECT id, name FROM tags WHERE lower(name) = lower($1)',
      [name],
    );
    if (existing) {
      res.json({ ...existing, ideaCount: 0, created: false });
      return;
    }
    const row = await one<{ id: number; name: string }>(
      'INSERT INTO tags (name) VALUES ($1) RETURNING id, name',
      [name],
    );
    res.status(201).json({ ...row!, ideaCount: 0, created: true });
  }),
);

/**
 * Delete a tag from the library. idea_tags.tag_id is ON DELETE CASCADE, so this
 * also clears it off every idea using it — the count is returned so the UI can
 * say what happened (it confirms with the same number before calling).
 */
tags.delete(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    const used = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM idea_tags WHERE tag_id = $1', [id]);
    const deleted = await one<{ id: number }>('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);
    if (!deleted) throw new HttpError(404, 'Tag not found');
    res.json({ ok: true, clearedFrom: used?.n ?? 0 });
  }),
);
