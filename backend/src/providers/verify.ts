/**
 * Provider verification layer.
 *
 * Phone OTP is a DEV stub (accepts OTP_DEV_CODE) until a real SMS provider is
 * wired. Google and Apple are verified for real when client IDs are configured;
 * with none set they fall back to DEV mode so local flows stay testable.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { JwksClient } from 'jwks-rsa';
import twilio from 'twilio';
import { config } from '../config';
import { ApiError } from '../errors';

export interface VerifiedIdentity {
  identifier: string;       // E.164 phone OR provider stable subject id
  email?: string | null;
  displayName?: string | null;
}

// ── Phone OTP ──────────────────────────────────────────────────────────────
const otpStore = new Map<string, { code: string; expiresAt: number }>();

let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilio() {
  if (!twilioClient) twilioClient = twilio(config.sms.twilioAccountSid, config.sms.twilioAuthToken);
  return twilioClient;
}

export async function sendOtp(phone: string): Promise<void> {
  if (config.sms.provider === 'twilio') {
    if (!config.sms.twilioAccountSid || !config.sms.twilioVerifyServiceSid) {
      throw ApiError.badRequest('Twilio Verify is not configured');
    }
    // Twilio Verify generates, sends and tracks the OTP for us.
    await getTwilio().verify.v2
      .services(config.sms.twilioVerifyServiceSid)
      .verifications.create({ to: phone, channel: 'sms' });
    return;
  }
  // DEV/stub: store a fixed code and log it.
  const code = config.providers.otpDevCode;
  otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  // eslint-disable-next-line no-console
  console.log(`[DEV SMS] OTP for ${phone} is ${code}`);
}

export async function verifyOtp(phone: string, code: string): Promise<VerifiedIdentity> {
  if (config.sms.provider === 'twilio') {
    const check = await getTwilio().verify.v2
      .services(config.sms.twilioVerifyServiceSid)
      .verificationChecks.create({ to: phone, code });
    if (check.status !== 'approved') throw ApiError.badRequest('Invalid or expired OTP', 'invalid_otp');
    return { identifier: phone };
  }
  // DEV/stub check.
  const entry = otpStore.get(phone);
  const ok = code === config.providers.otpDevCode || (entry && entry.code === code && entry.expiresAt > Date.now());
  if (!ok) throw ApiError.badRequest('Invalid or expired OTP', 'invalid_otp');
  otpStore.delete(phone);
  return { identifier: phone };
}

// ── Google ─────────────────────────────────────────────────────────────────
const googleClient = new OAuth2Client();

export async function verifyGoogle(idToken: string): Promise<VerifiedIdentity> {
  if (!idToken) throw ApiError.badRequest('Missing Google id token');

  const audiences = config.providers.googleClientIds;
  if (!audiences.length) {
    // DEV: no client IDs configured -> trust the token value as the subject.
    return { identifier: `google:${stableSub(idToken)}`, email: null };
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.badRequest('Invalid Google token', 'invalid_google_token');
  }
  if (!payload?.sub) throw ApiError.badRequest('Invalid Google token', 'invalid_google_token');
  if (payload.email && payload.email_verified === false) {
    payload.email = undefined; // unverified Google email is risky; drop it
  }
  return { identifier: `google:${payload.sub}`, email: payload.email ?? null, displayName: payload.name ?? null };
}

// ── Apple ──────────────────────────────────────────────────────────────────
const appleJwks = new JwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
});

function appleKey(header: jwt.JwtHeader, cb: (err: Error | null, key?: string) => void) {
  if (!header.kid) return cb(new Error('no kid'));
  appleJwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) return cb(err ?? new Error('no signing key'));
    cb(null, key.getPublicKey());
  });
}

export async function verifyApple(
  identityToken: string,
  fullName?: string | null,
): Promise<VerifiedIdentity> {
  if (!identityToken) throw ApiError.badRequest('Missing Apple identity token');

  const audiences = config.providers.appleClientIds;
  if (!audiences.length) {
    return { identifier: `apple:${stableSub(identityToken)}`, email: null, displayName: fullName ?? null };
  }

  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      identityToken,
      appleKey,
      { issuer: 'https://appleid.apple.com', audience: audiences as [string, ...string[]], algorithms: ['RS256'] },
      (err: jwt.VerifyErrors | null, decoded: string | jwt.JwtPayload | undefined) => {
        if (err || !decoded || typeof decoded === 'string') {
          return reject(ApiError.badRequest('Invalid Apple token', 'invalid_apple_token'));
        }
        resolve(decoded as jwt.JwtPayload);
      },
    );
  });

  if (!payload.sub) throw ApiError.badRequest('Invalid Apple token', 'invalid_apple_token');
  // Apple returns the name only on the first authorization — capture it now.
  return { identifier: `apple:${payload.sub}`, email: (payload.email as string) ?? null, displayName: fullName ?? null };
}

function stableSub(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}
