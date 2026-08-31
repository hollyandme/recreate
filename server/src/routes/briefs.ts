import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../lib/db.js';
import { h, idParam, HttpError } from '../lib/http.js';
import { removeImagesForBrief } from '../lib/cleanup.js';

export const briefs = Router();

interface BriefRow {
  id: number;
  idea_id: number;
  title: string;
  creator: string;
  due: string;
  intro: string;
  created_at: Date;
  ref_url: string;
  ref_source: string;
  ref_platform: string;
  ref_status: string;
  ref_tag: string | null;
  ref_hook: string;
  ref_body: string;
  ref_video_key: string | null;
}

interface ShotRow {
  id: number;
  brief_id: number;
  position: number;
  timestamp_label: string;
  comment: string;
  image_key: string | null;
  strokes: number[][][];
}

export function serializeShot(r: ShotRow) {
  return {
    id: r.id,
    briefId: r.brief_id,
    position: r.position,
    timestamp: r.timestamp_label,
    comment: r.comment,
    imageKey: r.image_key,
    // The client only ever needs a URL it can put in an <img src>. Local disk
    // streams it, S3 redirects to a short-lived signed URL — same path either way.
    imageUrl: r.image_key ? `/api/files/${r.image_key}` : null,
    strokes: r.strokes ?? [],
  };
}

function serializeBrief(r: BriefRow, shots: ShotRow[]) {
  return {
    id: r.id,
    ideaId: r.idea_id,
    title: r.title,
    creator: r.creator,
    due: r.due,
    intro: r.intro,
    createdAt: r.created_at.toISOString(),
    // The reference block is read straight off the idea, never copied onto the
    // brief: editing an idea's hook updates every brief that cites it.
    reference: {
      url: r.ref_url,
      sourceHandle: r.ref_source,
      platform: r.ref_platform,
      status: r.ref_status,
      tag: r.ref_tag ?? 'untagged',
      hook: r.ref_hook || 'No hook comment yet',
      body: r.ref_body || 'No body comment yet',
      videoUrl: r.ref_video_key ? `/api/files/${r.ref_video_key}` : null,
    },
    shots: shots.map(serializeShot),
  };
}

const SELECT_BRIEF = `
  SELECT b.*,
         i.url           AS ref_url,
         i.source_handle AS ref_source,
         i.platform      AS ref_platform,
         i.status        AS ref_status,
         i.hook          AS ref_hook,
         i.body          AS ref_body,
         i.video_key     AS ref_video_key,
         t.name          AS ref_tag
    FROM briefs b
    JOIN ideas i ON i.id = b.idea_id
    LEFT JOIN tags t ON t.id = i.tag_id`;

async function loadBrief(id: number) {
  const row = await one<BriefRow>(`${SELECT_BRIEF} WHERE b.id = $1`, [id]);
  if (!row) throw new HttpError(404, 'Brief not found');
  const shots = await query<ShotRow>(
    'SELECT * FROM shots WHERE brief_id = $1 ORDER BY position, id',
    [id],
  );
  return serializeBrief(row, shots);
}

briefs.get(
  '/',
  h(async (_req, res) => {
    const rows = await query<BriefRow>(`${SELECT_BRIEF} ORDER BY b.created_at DESC, b.id DESC`);
    res.json(rows.map((r) => serializeBrief(r, [])));
  }),
);

briefs.get(
  '/:id',
  h(async (req, res) => {
    res.json(await loadBrief(idParam(req)));
  }),
);

const CreateBody = z.object({ ideaId: z.number().int().positive() });

/**
 * One brief per video. Asking for a brief on an idea that already has one hands
 * back the existing brief rather than failing — the UI's chip row is a single
 * control that both opens and creates.
 */
briefs.post(
  '/',
  h(async (req, res) => {
    const { ideaId } = CreateBody.parse(req.body);

    const existing = await one<{ id: number }>('SELECT id FROM briefs WHERE idea_id = $1', [ideaId]);
    if (existing) {
      res.json(await loadBrief(existing.id));
      return;
    }

    const idea = await one<{ source_handle: string; note: string; tag_name: string | null }>(
      `SELECT i.source_handle, i.note, t.name AS tag_name
         FROM ideas i LEFT JOIN tags t ON t.id = i.tag_id
        WHERE i.id = $1`,
      [ideaId],
    );
    if (!idea) throw new HttpError(404, 'Idea not found');

    const title = `Recreate: ${idea.source_handle}${idea.tag_name ? ` (${idea.tag_name})` : ''}`;

    const id = await tx(async (c) => {
      const inserted = await c.query<{ id: number }>(
        'INSERT INTO briefs (idea_id, title, intro) VALUES ($1, $2, $3) RETURNING id',
        [ideaId, title, idea.note ?? ''],
      );
      const briefId = inserted.rows[0]!.id;
      // A new brief opens with three empty shots, as the design does.
      await c.query(
        'INSERT INTO shots (brief_id, position) SELECT $1, generate_series(1, 3)',
        [briefId],
      );
      return briefId;
    });

    res.status(201).json(await loadBrief(id));
  }),
);

const PatchBody = z
  .object({
    title: z.string().max(300),
    creator: z.string().max(200),
    due: z.string().max(120),
    intro: z.string().max(4000),
  })
  .partial();

briefs.patch(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    const input = PatchBody.parse(req.body);
    const keys = Object.keys(input) as (keyof typeof input)[];
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const updated = await one<{ id: number }>(
        `UPDATE briefs SET ${sets} WHERE id = $1 RETURNING id`,
        [id, ...keys.map((k) => input[k])],
      );
      if (!updated) throw new HttpError(404, 'Brief not found');
    }
    res.json(await loadBrief(id));
  }),
);

briefs.delete(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    await removeImagesForBrief(id);
    const deleted = await one<{ id: number }>('DELETE FROM briefs WHERE id = $1 RETURNING id', [id]);
    if (!deleted) throw new HttpError(404, 'Brief not found');
    res.json({ ok: true });
  }),
);

/** Append a shot to the end of the list. */
briefs.post(
  '/:id/shots',
  h(async (req, res) => {
    const id = idParam(req);
    const brief = await one<{ id: number }>('SELECT id FROM briefs WHERE id = $1', [id]);
    if (!brief) throw new HttpError(404, 'Brief not found');
    const row = await one<ShotRow>(
      `INSERT INTO shots (brief_id, position)
       VALUES ($1, COALESCE((SELECT MAX(position) FROM shots WHERE brief_id = $1), 0) + 1)
       RETURNING *`,
      [id],
    );
    res.status(201).json(serializeShot(row!));
  }),
);
