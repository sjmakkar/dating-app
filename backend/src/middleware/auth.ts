import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../errors';
import { verifyAccessToken } from '../auth/tokens';
import { query } from '../db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Require a valid Bearer access token; attaches req.userId. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Missing bearer token');

    const payload = verifyAccessToken(token);

    // Reject suspended/deleted users immediately.
    const { rows } = await query<{ status: string }>(`SELECT status FROM users WHERE id = $1`, [payload.sub]);
    if (!rows[0]) throw ApiError.unauthorized('User not found');
    if (rows[0].status !== 'active') throw ApiError.forbidden('Account not active');

    req.userId = payload.sub;
    // Best-effort discovery-freshness update; never blocks the request.
    query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [payload.sub]).catch(() => undefined);
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}
