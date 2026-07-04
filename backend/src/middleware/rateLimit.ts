import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * OTP start must be throttled per phone AND per IP — each SMS costs money and
 * unthrottled OTP is a classic abuse/cost vector (see spec).
 */
export const otpStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,                    // 5 OTP requests per window per key
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const phone = (req.body && req.body.phone) ? String(req.body.phone) : 'no-phone';
    return `${req.ip}:${phone}`;
  },
  message: { error: { code: 'rate_limited', message: 'Too many OTP requests. Try again later.' } },
});

/** Generic limiter for other auth verify endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
