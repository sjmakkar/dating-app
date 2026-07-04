import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';
import { config } from '../config';

const router = Router();
router.use(requireAuth);

/**
 * GET /v1/discovery
 * Paginated deck of candidate profiles. Geo radius + age + intent filters.
 * Excludes: self, anyone already swiped, and any pair with a block in EITHER
 * direction. Returns only a COARSE distance — never raw coordinates.
 */
router.get('/', asyncHandler(async (req, res) => {
  const q = z.object({
    radius_km: z.coerce.number().min(1).max(500).optional(),
    min_age: z.coerce.number().int().min(18).max(120).optional(),
    max_age: z.coerce.number().int().min(18).max(120).optional(),
    intent: z.enum(['serious', 'casual', 'friends']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor_km: z.coerce.number().min(0).optional(), // distance-based pagination cursor
  }).parse(req.query);

  const radiusKm = q.radius_km ?? config.discovery.radiusKm;
  const limit = q.limit ?? config.discovery.pageSize;
  const me = req.userId!;

  // Caller must have a location set to do radius discovery.
  const { rows: meRows } = await query<{ has_loc: boolean }>(
    `SELECT (location IS NOT NULL) AS has_loc FROM profiles WHERE user_id = $1`, [me],
  );
  if (!meRows[0]) throw ApiError.badRequest('Create your profile before discovery', 'no_profile');
  if (!meRows[0].has_loc) throw ApiError.badRequest('Set your location before discovery', 'no_location');

  const { rows } = await query(
    `
    WITH me AS (
      SELECT location FROM profiles WHERE user_id = $1
    )
    SELECT
      p.user_id,
      p.display_name,
      date_part('year', age(p.birth_date))::int AS age,
      p.gender,
      p.intent,
      p.bio,
      p.city,
      p.is_verified,
      ST_Distance(p.location, me.location) AS dist_m,
      COALESCE(
        (SELECT json_agg(json_build_object('url', ph.url, 'position', ph.position) ORDER BY ph.position)
           FROM photos ph
          WHERE ph.user_id = p.user_id AND ph.moderation_status = 'approved'),
        '[]'::json
      ) AS photos
    FROM profiles p, me, users u
    WHERE p.user_id = u.id
      AND u.status = 'active'
      AND p.user_id <> $1
      AND p.location IS NOT NULL
      AND ST_DWithin(p.location, me.location, $2)            -- radius in metres
      AND ($3::int  IS NULL OR date_part('year', age(p.birth_date)) >= $3)
      AND ($4::int  IS NULL OR date_part('year', age(p.birth_date)) <= $4)
      AND ($5::text IS NULL OR p.intent = $5::intent_type)
      AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = $1 AND s.swipee_id = p.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
           OR (b.blocker_id = p.user_id AND b.blocked_id = $1)
      )
      AND ST_Distance(p.location, me.location) > $6           -- cursor: strictly farther than last page
    ORDER BY dist_m ASC
    LIMIT $7
    `,
    [me, radiusKm * 1000, q.min_age ?? null, q.max_age ?? null, q.intent ?? null, q.cursor_km ? q.cursor_km * 1000 : 0, limit],
  );

  // Never leak raw coordinates — emit coarse distance only.
  const candidates = rows.map((r: any) => {
    const km = r.dist_m / 1000;
    const { dist_m, ...rest } = r;
    return { ...rest, distance_km: Math.max(1, Math.round(km)), distance_label: `${Math.max(1, Math.round(km))} km away` };
  });

  const nextCursorKm = rows.length === limit ? rows[rows.length - 1].dist_m / 1000 : null;
  res.json({ candidates, next_cursor_km: nextCursorKm });
}));

export default router;
