import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../lib/db.js';
import { h, idParam, HttpError } from '../lib/http.js';
import { detectPlatform, detectSource } from '../lib/links.js';
import { removeImagesForIdea, removeVideoForIdea } from '../lib/cleanup.js';
import { newVideoKey, storage } from '../lib/storage.js';
import { sniffVideoType } from '../lib/sniff.js';
import { DownloadError, downloadPostVideo } from '../lib/ytdlp.js';
import multer from 'multer';

export const ideas = Router();

export interface IdeaRow {
  id: number;
  url: string;
  platform: string;
  source_handle: string;
  note: string;
  hook: string;
  body: string;
  tag_ids: number[];
  tag_names: string[];
  status: string;
  saved_at: Date;
  video_key: string | null;
  has_brief: boolean;
  brief_id: number | null;
}

export function serializeIdea(r: IdeaRow) {
  return {
    id: r.id,
    url: r.url,
    platform: r.platform,
    sourceHandle: r.source_handle,
    note: r.note,
    hook: r.hook,
    body: r.body,
    // bigint[] comes back as strings (the INT8 parser is scalar-only), so coerce.
    tagIds: (r.tag_ids ?? []).map(Number),
    tags: r.tag_names ?? [],
    status: r.status,
    savedAt: r.saved_at.toISOString(),
    briefId: r.brief_id,
    videoKey: r.video_key,
    videoUrl: r.video_key ? `/api/files/${r.video_key}` : null,
  };
}

// An idea's tags are aggregated into arrays, ordered by name so chips stay stable.
// GROUP_IDEA is kept separate so a WHERE clause can be injected before it.
const SELECT_IDEA = `
  SELECT i.*,
         COALESCE(array_agg(t.id   ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS tag_ids,
         COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS tag_names,
         b.id AS brief_id, (b.id IS NOT NULL) AS has_brief
    FROM ideas i
    LEFT JOIN idea_tags it ON it.idea_id = i.id
    LEFT JOIN tags t        ON t.id = it.tag_id
    LEFT JOIN briefs b      ON b.idea_id = i.id`;
const GROUP_IDEA = 'GROUP BY i.id, b.id';

/**
 * The whole library, newest first.
 *
 * Filters are offered for API consumers, but the UI deliberately fetches
 * unfiltered: its tag chips show counts scoped to the *other two* filters, and
 * computing those from one in-memory list beats a round trip per chip. The
 * library is a small team's reading list, not a feed.
 */
ideas.get(
  '/',
  h(async (req, res) => {
    const where: string[] = [];
    const params: unknown[] = [];
    const { platform, status, tagId } = req.query;

    if (typeof platform === 'string' && platform !== 'All') {
      params.push(platform);
      where.push(`i.platform = $${params.length}`);
    }
    if (typeof status === 'string' && status !== 'Any') {
      params.push(status);
      where.push(`i.status = $${params.length}`);
    }
    if (tagId === 'null') {
      where.push('NOT EXISTS (SELECT 1 FROM idea_tags it2 WHERE it2.idea_id = i.id)');
    } else if (typeof tagId === 'string' && tagId) {
      params.push(Number(tagId));
      where.push(
        `EXISTS (SELECT 1 FROM idea_tags it2 WHERE it2.idea_id = i.id AND it2.tag_id = $${params.length})`,
      );
    }

    const rows = await query<IdeaRow>(
      `${SELECT_IDEA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${GROUP_IDEA} ORDER BY i.saved_at DESC, i.id DESC`,
      params,
    );
    res.json(rows.map(serializeIdea));
  }),
);

/**
 * Replace the full set of tags on an idea. Non-existent tag ids are ignored
 * (selected via the tags table) rather than raising a foreign-key error.
 */
async function setIdeaTags(ideaId: number, tagIds: number[]): Promise<void> {
  await query('DELETE FROM idea_tags WHERE idea_id = $1', [ideaId]);
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return;
  await query(
    `INSERT INTO idea_tags (idea_id, tag_id)
       SELECT $1, id FROM tags WHERE id = ANY($2::bigint[])
     ON CONFLICT DO NOTHING`,
    [ideaId, unique],
  );
}

const CreateBody = z.object({
  url: z.string().trim().min(1).max(2048),
  note: z.string().trim().max(2000).optional(),
  tagIds: z.array(z.number().int().positive()).max(50).optional(),
});

ideas.post(
  '/',
  h(async (req, res) => {
    const input = CreateBody.parse(req.body);
    const created = await one<{ id: number }>(
      `INSERT INTO ideas (url, platform, source_handle, note)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.url, detectPlatform(input.url), detectSource(input.url), input.note ?? ''],
    );
    await setIdeaTags(created!.id, input.tagIds ?? []);
    const row = await one<IdeaRow>(`${SELECT_IDEA} WHERE i.id = $1 ${GROUP_IDEA}`, [created!.id]);
    res.status(201).json(serializeIdea(row!));
  }),
);

const PatchBody = z
  .object({
    note: z.string().max(2000),
    hook: z.string().max(4000),
    body: z.string().max(4000),
    status: z.enum(['To try', 'Tried']),
    tagIds: z.array(z.number().int().positive()).max(50),
  })
  .partial();

/** Everything on a card saves as you type, so this is a partial update. */
ideas.patch(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    const input = PatchBody.parse(req.body);

    const columns: Record<string, unknown> = {};
    if (input.note !== undefined) columns.note = input.note;
    if (input.hook !== undefined) columns.hook = input.hook;
    if (input.body !== undefined) columns.body = input.body;
    if (input.status !== undefined) columns.status = input.status;

    const keys = Object.keys(columns);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const updated = await one<{ id: number }>(
        `UPDATE ideas SET ${sets} WHERE id = $1 RETURNING id`,
        [id, ...keys.map((k) => columns[k])],
      );
      if (!updated) throw new HttpError(404, 'Idea not found');
    } else if (input.tagIds !== undefined) {
      const exists = await one<{ id: number }>('SELECT id FROM ideas WHERE id = $1', [id]);
      if (!exists) throw new HttpError(404, 'Idea not found');
    }

    if (input.tagIds !== undefined) await setIdeaTags(id, input.tagIds);

    const row = await one<IdeaRow>(`${SELECT_IDEA} WHERE i.id = $1 ${GROUP_IDEA}`, [id]);
    if (!row) throw new HttpError(404, 'Idea not found');
    res.json(serializeIdea(row));
  }),
);

/**
 * Deleting an idea cascades to its brief (and that brief's shots). The UI says
 * so in the confirm, which is why the response reports whether one went with it.
 */
ideas.delete(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    const brief = await one<{ id: number }>('SELECT id FROM briefs WHERE idea_id = $1', [id]);
    // Neither screenshots nor the video are cascaded by the database.
    await removeImagesForIdea(id);
    await removeVideoForIdea(id);
    const deleted = await one<{ id: number }>('DELETE FROM ideas WHERE id = $1 RETURNING id', [id]);
    if (!deleted) throw new HttpError(404, 'Idea not found');
    res.json({ ok: true, deletedBriefId: brief?.id ?? null });
  }),
);

/** Generous, because video is inherently large; the UI warns before uploading. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
});

/**
 * Attach a reference video to an idea. Stored once and served to everyone
 * opening its brief, so a teammate can scrub and grab their own frames.
 */
ideas.post(
  '/:id/video',
  uploadVideo.single('file'),
  h(async (req, res) => {
    const id = idParam(req);
    const file = req.file;
    if (!file) throw new HttpError(400, 'Expected a video file under "file"');

    const sniffed = sniffVideoType(file.buffer);
    if (!sniffed) throw new HttpError(415, 'That file is not an MP4, WebM or QuickTime video.');

    const existing = await one<{ video_key: string | null }>(
      'SELECT video_key FROM ideas WHERE id = $1',
      [id],
    );
    if (!existing) throw new HttpError(404, 'Idea not found');

    const key = newVideoKey(sniffed);
    await storage.put(key, file.buffer, sniffed);
    await query('UPDATE ideas SET video_key = $2 WHERE id = $1', [id, key]);

    // Drop the previous video only once the row points at the new one.
    if (existing.video_key) {
      storage.remove(existing.video_key).catch((err) => console.error('storage delete failed', err));
    }

    const row = await one<IdeaRow>(`${SELECT_IDEA} WHERE i.id = $1 ${GROUP_IDEA}`, [id]);
    res.status(201).json(serializeIdea(row!));
  }),
);

ideas.delete(
  '/:id/video',
  h(async (req, res) => {
    const id = idParam(req);
    await removeVideoForIdea(id);
    const updated = await one<{ id: number }>(
      'UPDATE ideas SET video_key = NULL WHERE id = $1 RETURNING id',
      [id],
    );
    if (!updated) throw new HttpError(404, 'Idea not found');
    const row = await one<IdeaRow>(`${SELECT_IDEA} WHERE i.id = $1 ${GROUP_IDEA}`, [id]);
    res.json(serializeIdea(row!));
  }),
);

/**
 * Fetch the post's video server-side (yt-dlp) and attach it, so the reference
 * video is available in the brief without the third-party downloader dance. On
 * any failure we answer 502 with `fallback: true`; the client then offers the
 * manual downloader link, so the user is never worse off than before.
 */
ideas.post(
  '/:id/download-video',
  h(async (req, res) => {
    const id = idParam(req);
    const idea = await one<{ url: string; platform: string; video_key: string | null }>(
      'SELECT url, platform, video_key FROM ideas WHERE id = $1',
      [id],
    );
    if (!idea) throw new HttpError(404, 'Idea not found');
    if (idea.platform === 'Link') throw new HttpError(400, 'A plain link has no video to download.');

    let buffer: Buffer;
    try {
      buffer = await downloadPostVideo(idea.url);
    } catch (err) {
      const fallback = err instanceof DownloadError ? err.fallback : true;
      const message = err instanceof Error ? err.message : 'Could not download this video.';
      res.status(502).json({ error: message, fallback });
      return;
    }

    const sniffed = sniffVideoType(buffer);
    if (!sniffed) {
      res.status(502).json({ error: 'The downloaded file is not a supported video.', fallback: true });
      return;
    }

    const key = newVideoKey(sniffed);
    await storage.put(key, buffer, sniffed);
    await query('UPDATE ideas SET video_key = $2 WHERE id = $1', [id, key]);
    if (idea.video_key) {
      storage.remove(idea.video_key).catch((err) => console.error('storage delete failed', err));
    }

    const row = await one<IdeaRow>(`${SELECT_IDEA} WHERE i.id = $1 ${GROUP_IDEA}`, [id]);
    res.status(201).json(serializeIdea(row!));
  }),
);
