import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

/** Thrown by handlers to produce a specific status instead of a 500. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Wrap an async handler so a rejected promise reaches the error middleware. */
export function h(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** Parse a positive integer route param, or 404 rather than letting NaN hit SQL. */
export function idParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found');
  return n;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // A malformed body is the caller's problem, not a server fault.
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request body', issues: err.issues });
    return;
  }
  // Multer reports an oversized upload this way; unhandled it surfaced as a
  // bare "Internal error", which told the user nothing about a file that was
  // simply too big.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'That image is too large. Keep screenshots under 25 MB.' });
    return;
  }

  console.error(err);

  // 42P01 = undefined_table. This means the database is reachable but has never
  // been migrated — overwhelmingly the state of a fresh deploy whose release
  // step did not run. Saying so is worth far more than "Internal error", and it
  // leaks nothing: it is an operational fact, not data.
  // 42703 = undefined_column: the code is ahead of the schema, i.e. a deploy
  // whose migration step did not run. Same operational fix as a missing table.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42703') {
    res.status(503).json({
      error: 'The database is missing a column this version needs — run the migrations (npm run migrate:prod).',
    });
    return;
  }

  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
    res.status(503).json({
      error: 'The database has no tables yet — run the migrations (npm run migrate:prod).',
    });
    return;
  }

  res.status(500).json({ error: 'Internal error' });
}
