import { Router } from 'express';
import { h, HttpError } from '../lib/http.js';
import { isValidKey, storage } from '../lib/storage.js';

export const files = Router();

const TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

/**
 * Serve an uploaded screenshot. Keys are UUIDs we minted, and the pattern is
 * checked before the key reaches any filesystem or bucket call, so a crafted
 * path cannot traverse anywhere.
 */
files.get(
  '/*key',
  h(async (req, res) => {
    const parts = req.params.key;
    const key = Array.isArray(parts) ? parts.join('/') : String(parts ?? '');
    if (!isValidKey(key)) throw new HttpError(404, 'Not found');

    const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
    res.setHeader('Content-Type', TYPE_BY_EXT[ext] ?? 'application/octet-stream');

    try {
      await storage.serve(key, res);
    } catch {
      throw new HttpError(404, 'Not found');
    }
  }),
);
