import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db';

export interface AccessPayload {
  sub: string;       // user id
  type: 'access';
}

/** Mint a short-lived access token. */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' } as AccessPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessPayload;
  if (decoded.type !== 'access') throw new Error('wrong token type');
  return decoded;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a rotating refresh token. The raw token is returned to the client;
 * only its hash is stored, so a DB leak cannot be replayed.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtl * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), expiresAt],
  );
  return raw;
}

/** Validate a refresh token, rotate it, and return the new pair's refresh token. */
export async function rotateRefreshToken(raw: string): Promise<{ userId: string; refreshToken: string }> {
  const tokenHash = hashToken(raw);
  const { rows } = await query<{ id: string; user_id: string; revoked_at: Date | null; expires_at: Date }>(
    `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.expires_at.getTime() < Date.now()) {
    throw new Error('invalid refresh token');
  }
  // Revoke the old token and issue a new one (rotation).
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
  const refreshToken = await issueRefreshToken(row.user_id);
  return { userId: row.user_id, refreshToken };
}

/** Revoke one token (logout) or all of a user's tokens (logout everywhere). */
export async function revokeRefreshToken(raw: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(raw),
  ]);
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export async function issueSession(userId: string) {
  const accessToken = signAccessToken(userId);
  const refreshToken = await issueRefreshToken(userId);
  return { accessToken, refreshToken, expiresIn: config.jwt.accessTtl };
}
