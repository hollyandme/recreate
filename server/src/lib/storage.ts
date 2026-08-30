import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { REPO_ROOT } from './env.js';

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Write the object to an Express response — streamed on disk, redirected on S3. */
  serve(key: string, res: Response): Promise<void>;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXT_BY_TYPE);

/** Opaque, unguessable key. Never derived from the uploaded filename. */
export function newImageKey(contentType: string): string {
  return `shots/${randomUUID()}${EXT_BY_TYPE[contentType] ?? '.bin'}`;
}

/** Keys we minted look like `shots/<uuid><ext>`; refuse anything else. */
const KEY_RE = /^shots\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Belt and braces: the key is validated at the route, and the resolved path
    // is re-checked to stay under the root so no key can ever climb out of it.
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error('key escapes storage root');
    }
    return full;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async serve(key: string, res: Response): Promise<void> {
    const full = this.resolve(key);
    const info = await stat(full);
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    createReadStream(full).pipe(res);
  }
}

class S3Storage implements Storage {
  private client: import('@aws-sdk/client-s3').S3Client | null = null;

  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly endpoint: string | undefined,
  ) {}

  // Imported lazily so a local-disk deployment never pays to load the AWS SDK.
  private async sdk() {
    const mod = await import('@aws-sdk/client-s3');
    this.client ??= new mod.S3Client({
      region: this.region,
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    });
    return { mod, client: this.client };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { mod, client } = await this.sdk();
    await client.send(
      new mod.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async remove(key: string): Promise<void> {
    const { mod, client } = await this.sdk();
    await client.send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async serve(key: string, res: Response): Promise<void> {
    const { mod, client } = await this.sdk();
    const signer = await import('@aws-sdk/s3-request-presigner');
    const url = await signer.getSignedUrl(
      client,
      new mod.GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 300 },
    );
    res.redirect(302, url);
  }
}

export function makeStorage(): Storage {
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    return new S3Storage(bucket, process.env.AWS_REGION ?? 'us-east-1', process.env.S3_ENDPOINT);
  }
  // Relative to the repo root, never to cwd: dev and production start the
  // server from different directories and must land on the same folder.
  const configured = process.env.UPLOAD_DIR ?? 'uploads';
  const root = path.isAbsolute(configured) ? configured : path.resolve(REPO_ROOT, configured);
  return new LocalStorage(root);
}

export const storage = makeStorage();
