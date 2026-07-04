import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { query, withTransaction } from '../db';
import { moderateImage, moderateText } from '../providers/moderation';
import { uploadImage, isStorageConfigured } from '../providers/storage';

const router = Router();
router.use(requireAuth);

// ── Photo upload storage ─────────────────────────────────────────────────
// Phase 1: store uploaded JPGs on the backend and serve them statically.
// Production should push these to a CDN-backed bucket (e.g. Supabase Storage)
// and store that CDN URL instead — the photos.url column already expects a URL.
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(), // keep bytes in memory, then push to CDN storage
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/**
 * Persist an uploaded image and return its public URL.
 * Prefers Supabase Storage (CDN); falls back to local disk for dev when Supabase
 * is not configured.
 */
async function persistPhoto(file: Express.Multer.File, req: any): Promise<string> {
  const contentType = file.mimetype || 'image/jpeg';
  if (isStorageConfigured()) {
    const url = await uploadImage(file.buffer, contentType);
    if (url) return url;
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer);
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

/** Reject under-18 at write time (and on edit). */
function assertAdult(birthDate: string) {
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) throw ApiError.badRequest('Invalid birth_date');
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  if (age < 18) throw ApiError.badRequest('You must be 18 or older', 'underage');
}

async function loadMe(userId: string) {
  const { rows: profileRows } = await query(
    `SELECT user_id, display_name, birth_date, gender, intent, bio, city, is_verified, updated_at
       FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const { rows: photos } = await query(
    `SELECT id, url, position, moderation_status
       FROM photos WHERE user_id = $1 ORDER BY position ASC`,
    [userId],
  );
  const { rows: userRows } = await query(
    `SELECT id, status, created_at, last_active_at FROM users WHERE id = $1`,
    [userId],
  );
  return { user: userRows[0], profile: profileRows[0] ?? null, photos };
}

// GET /v1/me — current user + profile + photos
router.get('/', asyncHandler(async (req, res) => {
  res.json(await loadMe(req.userId!));
}));

// PATCH /v1/me/profile — create or update profile (upsert); re-moderate bio
const profileSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),
  birth_date: z.string().optional(),                 // YYYY-MM-DD
  gender: z.string().min(1).max(40).optional(),
  intent: z.enum(['serious', 'casual', 'friends']).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

router.patch('/profile', asyncHandler(async (req, res) => {
  const body = profileSchema.parse(req.body);
  if (body.birth_date) assertAdult(body.birth_date);
  const cleanBio = body.bio !== undefined ? await moderateText(body.bio) : undefined;

  const exists = (await query(`SELECT 1 FROM profiles WHERE user_id = $1`, [req.userId])).rows.length > 0;

  if (!exists) {
    // First write must establish the required columns.
    if (!body.display_name || !body.birth_date || !body.gender) {
      throw ApiError.badRequest('display_name, birth_date and gender are required to create a profile');
    }
    await query(
      `INSERT INTO profiles (user_id, display_name, birth_date, gender, intent, bio, city, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
               CASE WHEN $8::float8 IS NULL OR $9::float8 IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($9,$8),4326)::geography END)`,
      [req.userId, body.display_name, body.birth_date, body.gender,
       body.intent ?? 'serious', cleanBio ?? null, body.city ?? null, body.lat ?? null, body.lng ?? null],
    );
  } else {
    await query(
      `UPDATE profiles SET
         display_name = COALESCE($2, display_name),
         birth_date   = COALESCE($3, birth_date),
         gender       = COALESCE($4, gender),
         intent       = COALESCE($5, intent),
         bio          = COALESCE($6, bio),
         city         = COALESCE($7, city),
         location     = CASE WHEN $8::float8 IS NULL OR $9::float8 IS NULL THEN location
                             ELSE ST_SetSRID(ST_MakePoint($9,$8),4326)::geography END,
         updated_at   = now()
       WHERE user_id = $1`,
      [req.userId, body.display_name ?? null, body.birth_date ?? null, body.gender ?? null,
       body.intent ?? null, cleanBio ?? null, body.city ?? null, body.lat ?? null, body.lng ?? null],
    );
  }
  res.json(await loadMe(req.userId!));
}));

// POST /v1/me/photos — record a photo (already uploaded to CDN), queue moderation
router.post('/photos', asyncHandler(async (req, res) => {
  const { url, position } = z.object({
    url: z.string().url(),
    position: z.number().int().min(0).max(9).optional(),
  }).parse(req.body);

  const photo = await withTransaction(async (client) => {
    const pos = position ?? (await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(position)+1, 0) AS next FROM photos WHERE user_id = $1`, [req.userId],
    )).rows[0].next;
    const { rows } = await client.query(
      `INSERT INTO photos (user_id, url, position, moderation_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, url, position, moderation_status`,
      [req.userId, url, pos],
    );
    return rows[0];
  });

  // Moderate new upload only (cache via stored status). Stub auto-approves.
  const verdict = await moderateImage(url);
  await query(`UPDATE photos SET moderation_status = $2 WHERE id = $1`, [photo.id, verdict]);
  // Flip is_verified true once user has at least one approved photo (basic heuristic).
  res.status(201).json({ ...photo, moderation_status: verdict });
}));

// POST /v1/me/photos/upload — multipart JPG upload (field name: "photo")
router.post('/photos/upload', upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided (field "photo")');

  // Store in CDN-backed object storage (or local disk fallback) → URL.
  const url = await persistPhoto(req.file, req);

  const photo = await withTransaction(async (client) => {
    const pos = (await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(position)+1, 0) AS next FROM photos WHERE user_id = $1`, [req.userId],
    )).rows[0].next;
    const { rows } = await client.query(
      `INSERT INTO photos (user_id, url, position, moderation_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, url, position, moderation_status`,
      [req.userId, url, pos],
    );
    return rows[0];
  });

  const verdict = await moderateImage(url); // stub auto-approves
  await query(`UPDATE photos SET moderation_status = $2 WHERE id = $1`, [photo.id, verdict]);
  res.status(201).json({ ...photo, moderation_status: verdict });
}));

// DELETE /v1/me/photos/:id
router.delete('/photos/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM photos WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!rowCount) throw ApiError.notFound('Photo not found');
  res.json({ ok: true });
}));

// POST /v1/me/verify — start selfie-liveness verification (KYC vendor stub)
router.post('/verify', asyncHandler(async (req, res) => {
  // TODO: kick off KYC vendor liveness session; on webhook success set is_verified = true.
  // Phase 1 stub marks verified immediately so the flow is exercisable.
  await query(`UPDATE profiles SET is_verified = true, updated_at = now() WHERE user_id = $1`, [req.userId]);
  res.json({ status: 'verified' });
}));

export default router;
