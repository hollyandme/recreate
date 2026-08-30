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
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
}
