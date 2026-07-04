import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { otpStartLimiter, authLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import { sendOtp, verifyOtp, verifyGoogle, verifyApple } from '../providers/verify';
import { findOrCreate, linkIdentity } from '../auth/identityService';
import { issueSession, rotateRefreshToken, revokeRefreshToken, revokeAllForUser, signAccessToken, verifyAccessToken } from '../auth/tokens';

const router = Router();

// E.164: + followed by 8–15 digits.
const phoneSchema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164') });

function sessionResponse(r: { userId: string; isNew: boolean; hasProfile: boolean }, tokens: any) {
  return {
    user_id: r.userId,
    is_new: r.isNew,
    needs_onboarding: !r.hasProfile,
    ...tokens,
  };
}

// POST /v1/auth/phone/start — send SMS OTP (rate-limited per phone & IP)
router.post('/phone/start', otpStartLimiter, asyncHandler(async (req, res) => {
  const { phone } = phoneSchema.parse(req.body);
  await sendOtp(phone);
  res.json({ ok: true });
}));

// POST /v1/auth/phone/verify — verify OTP → find-or-create → session
router.post('/phone/verify', authLimiter, asyncHandler(async (req, res) => {
  const { phone, code } = z.object({
    phone: phoneSchema.shape.phone,
    code: z.string().min(4).max(8),
  }).parse(req.body);

  const vi = await verifyOtp(phone, code);
  const result = await findOrCreate('phone', vi);
  const tokens = await issueSession(result.userId);
  res.json(sessionResponse(result, tokens));
}));

// POST /v1/auth/google
router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  const { id_token } = z.object({ id_token: z.string().min(1) }).parse(req.body);
  const vi = await verifyGoogle(id_token);
  const result = await findOrCreate('google', vi);
  const tokens = await issueSession(result.userId);
  res.json(sessionResponse(result, tokens));
}));

// POST /v1/auth/apple
router.post('/apple', authLimiter, asyncHandler(async (req, res) => {
  const { identity_token, full_name } = z.object({
    identity_token: z.string().min(1),
    full_name: z.string().optional(),     // Apple sends name only on first authorization
  }).parse(req.body);
  const vi = await verifyApple(identity_token, full_name ?? null);
  const result = await findOrCreate('apple', vi);
  const tokens = await issueSession(result.userId);
  res.json(sessionResponse(result, tokens));
}));

// POST /v1/auth/link — attach a provider to the CURRENT authenticated user
router.post('/link', requireAuth, asyncHandler(async (req, res) => {
  const { provider, ...rest } = z.object({
    provider: z.enum(['phone', 'google', 'apple']),
    phone: z.string().optional(),
    code: z.string().optional(),
    id_token: z.string().optional(),
    identity_token: z.string().optional(),
    full_name: z.string().optional(),
  }).parse(req.body);

  let vi;
  if (provider === 'phone') {
    if (!rest.phone || !rest.code) throw ApiError.badRequest('phone and code required');
    vi = await verifyOtp(rest.phone, rest.code);
  } else if (provider === 'google') {
    if (!rest.id_token) throw ApiError.badRequest('id_token required');
    vi = await verifyGoogle(rest.id_token);
  } else {
    if (!rest.identity_token) throw ApiError.badRequest('identity_token required');
    vi = await verifyApple(rest.identity_token, rest.full_name ?? null);
  }

  await linkIdentity(req.userId!, provider, vi);
  res.json({ ok: true });
}));

// POST /v1/auth/refresh — rotate refresh token, mint new access token
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refresh_token } = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
  let rotated;
  try {
    rotated = await rotateRefreshToken(refresh_token);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  res.json({
    user_id: rotated.userId,
    accessToken: signAccessToken(rotated.userId),
    refreshToken: rotated.refreshToken,
  });
}));

// POST /v1/auth/logout — revoke this session, or all sessions
router.post('/logout', asyncHandler(async (req, res) => {
  const { refresh_token, everywhere } = z.object({
    refresh_token: z.string().optional(),
    everywhere: z.boolean().optional(),
  }).parse(req.body);

  if (everywhere) {
    // Needs an authenticated user to revoke all.
    const header = req.header('authorization') ?? '';
    const token = header.split(' ')[1];
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        await revokeAllForUser(payload.sub);
      } catch { /* ignore */ }
    }
  } else if (refresh_token) {
    await revokeRefreshToken(refresh_token);
  }
  res.json({ ok: true });
}));

export default router;
