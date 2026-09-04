import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Pull a post's video file with yt-dlp so the app can attach it without sending
 * the user to a third-party downloader. TikTok is reliable; Instagram often
 * needs a login and may fail — every failure is a DownloadError with
 * `fallback: true`, and the route hands those back so the client can fall back
 * to the manual downloader link. Nothing here is trusted to always work.
 */
export class DownloadError extends Error {
  constructor(
    message: string,
    /** Whether the client should offer the manual downloader instead. */
    readonly fallback = true,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

const YTDLP = process.env.YTDLP_PATH ?? 'yt-dlp';
const MAX_BYTES = 200 * 1024 * 1024;
const TIMEOUT_MS = 90_000;

/** Download the video at `url` and return it as a buffer. */
export async function downloadPostVideo(url: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rec-dl-'));
  const outTemplate = path.join(dir, 'video.%(ext)s');
  try {
    await runYtDlp([
      '--no-playlist',
      '--no-warnings',
      '--max-filesize',
      '200M',
      // Prefer a single progressive mp4 so no ffmpeg merge is needed.
      '-f',
      'mp4/best[ext=mp4]/best',
      '-o',
      outTemplate,
      url,
    ]);
    const [produced] = (await readdir(dir)).filter((f) => f.startsWith('video.'));
    if (!produced) throw new DownloadError('The post has no downloadable video.');
    const buf = await readFile(path.join(dir, produced));
    if (buf.byteLength === 0) throw new DownloadError('The downloaded file was empty.');
    if (buf.byteLength > MAX_BYTES) throw new DownloadError('That video is larger than 200 MB.', false);
    return buf;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new DownloadError('The download timed out.'));
    }, TIMEOUT_MS);

    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // ENOENT = the yt-dlp binary is not installed on the server.
      reject(
        new DownloadError(
          err.code === 'ENOENT'
            ? 'Server-side download is unavailable right now.'
            : `Could not start the download: ${err.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const last = stderr.trim().split('\n').pop() ?? '';
      // Instagram's login walls surface here; keep the message short for the UI.
      const needsLogin = /login|rate-limit|private|not available|sign in/i.test(last);
      reject(
        new DownloadError(
          needsLogin ? 'This post needs a login to download.' : 'Could not download this video.',
        ),
      );
    });
  });
}
