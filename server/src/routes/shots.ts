import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { one } from '../lib/db.js';
import { h, idParam, HttpError } from '../lib/http.js';
import { removeImageForShot } from '../lib/cleanup.js';
import { newImageKey, storage } from '../lib/storage.js';
import { sniffImageType } from '../lib/sniff.js';
import { serializeShot } from './briefs.js';

export const shots = Router();

/**
 * A stroke is a list of [x, y] points in a normalised 0-100 space relative to
 * the frame. Keeping it vector — rather than baking a raster overlay — is what
 * lets an annotation print sharp at any size and stay undoable.
 */
const Point = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);
const Strokes = z.array(z.array(Point).max(2000)).max(200);

const PatchBody = z
  .object({
    timestamp: z.string().max(60),
    comment: z.string().max(4000),
    strokes: Strokes,
  })
  .partial();

const COLUMN: Record<string, string> = {
  timestamp: 'timestamp_label',
  comment: 'comment',
  strokes: 'strokes',
};

shots.patch(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    const input = PatchBody.parse(req.body);
    const keys = Object.keys(input) as (keyof typeof input)[];

    if (!keys.length) throw new HttpError(400, 'Nothing to update');

    const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 2}`).join(', ');
    const values = keys.map((k) => (k === 'strokes' ? JSON.stringify(input[k]) : input[k]));
    const row = await one(`UPDATE shots SET ${sets} WHERE id = $1 RETURNING *`, [id, ...values]);
    if (!row) throw new HttpError(404, 'Shot not found');
    res.json(serializeShot(row as never));
  }),
);

shots.delete(
  '/:id',
  h(async (req, res) => {
    const id = idParam(req);
    await removeImageForShot(id);
    const deleted = await one<{ id: number }>('DELETE FROM shots WHERE id = $1 RETURNING id', [id]);
    if (!deleted) throw new HttpError(404, 'Shot not found');
    res.json({ ok: true });
  }),
);

/** Generous: the client shrinks anything large, so this is a backstop. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  // No fileFilter: the browser's declared type is unreliable — routinely empty
  // for a perfectly good PNG — so the bytes are inspected after upload instead.
});

/**
 * Drop a screenshot into a shot. The file goes to object storage and the row
 * keeps only the key — never a data URL. That is what makes the print view
 * reliable: the sheet renders a plain <img> with a real URL.
 */
shots.post(
  '/:id/image',
  upload.single('file'),
  h(async (req, res) => {
    const id = idParam(req);
    const file = req.file;
    if (!file) throw new HttpError(400, 'Expected an image file under "file"');

    const existing = await one<{ image_key: string | null }>(
      'SELECT image_key FROM shots WHERE id = $1',
      [id],
    );
    if (!existing) throw new HttpError(404, 'Shot not found');

    const sniffed = sniffImageType(file.buffer);
    if (sniffed === 'image/heic') {
      throw new HttpError(
        415,
        'HEIC images cannot be displayed in a browser. Export the screenshot as PNG or JPEG and try again.',
      );
    }
    if (!sniffed) {
      throw new HttpError(415, 'That file is not a PNG, JPEG, GIF, WebP or AVIF image.');
    }

    const key = newImageKey(sniffed);
    await storage.put(key, file.buffer, sniffed);

    const row = await one('UPDATE shots SET image_key = $2 WHERE id = $1 RETURNING *', [id, key]);

    // Replacing a screenshot leaves the old object behind; drop it after the row
    // points at the new one, so a failure here can never strand the new image.
    if (existing.image_key) {
      storage.remove(existing.image_key).catch((err) => console.error('storage delete failed', err));
    }

    res.status(201).json(serializeShot(row as never));
  }),
);

shots.delete(
  '/:id/image',
  h(async (req, res) => {
    const id = idParam(req);
    await removeImageForShot(id);
    const row = await one('UPDATE shots SET image_key = NULL WHERE id = $1 RETURNING *', [id]);
    if (!row) throw new HttpError(404, 'Shot not found');
    res.json(serializeShot(row as never));
  }),
);
