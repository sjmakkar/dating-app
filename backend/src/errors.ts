import { NextFunction, Request, Response } from 'express';

/** Throwable HTTP error carrying a status code and a stable error code. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest(msg: string, code = 'bad_request') { return new ApiError(400, code, msg); }
  static unauthorized(msg = 'Unauthorized', code = 'unauthorized') { return new ApiError(401, code, msg); }
  static forbidden(msg = 'Forbidden', code = 'forbidden') { return new ApiError(403, code, msg); }
  static notFound(msg = 'Not found', code = 'not_found') { return new ApiError(404, code, msg); }
  static conflict(msg: string, code = 'conflict') { return new ApiError(409, code, msg); }
  static tooMany(msg = 'Too many requests', code = 'rate_limited') { return new ApiError(429, code, msg); }
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // Postgres unique-violation → 409
  if (err && err.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'Resource already exists' } });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
