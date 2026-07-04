import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { query, withTransaction } from '../db';
import { createChannel, closeChannel } from '../providers/chat';
import { sendPushToUser } from '../providers/push';

const router = Router();
router.use(requireAuth);

// Canonical pair ordering: a_id < b_id (matches the CHECK constraint).
function canonical(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * POST /v1/swipes — record like/pass. If it completes a mutual like, create the
 * match + chat channel atomically and return the new match.
 */
router.post('/swipes', asyncHandler(async (req, res) => {
  const { swipee_id, direction } = z.object({
    swipee_id: z.string().uuid(),
    direction: z.enum(['like', 'pass']),
  }).parse(req.body);

  const me = req.userId!;
  if (swipee_id === me) throw ApiError.badRequest('Cannot swipe yourself');

  // Respect blocks in either direction.
  const blocked = await query(
    `SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,
    [me, swipee_id],
  );
  if (blocked.rows.length) throw ApiError.forbidden('Interaction not allowed');

  const result = await withTransaction(async (client) => {
    // Idempotent insert of my decision.
    await client.query(
      `INSERT INTO swipes (swiper_id, swipee_id, direction)
       VALUES ($1, $2, $3)
       ON CONFLICT (swiper_id, swipee_id) DO NOTHING`,
      [me, swipee_id, direction],
    );

    if (direction !== 'like') return { matched: false as const };

    // Did the other side already like me?
    const reciprocal = await client.query(
      `SELECT 1 FROM swipes WHERE swiper_id=$1 AND swipee_id=$2 AND direction='like'`,
      [swipee_id, me],
    );
    if (!reciprocal.rows.length) return { matched: false as const };

    const [a, b] = canonical(me, swipee_id);
    // Create match if not present.
    const existing = await client.query<{ id: string; chat_channel_id: string | null; status: string }>(
      `SELECT id, chat_channel_id, status FROM matches WHERE user_a_id=$1 AND user_b_id=$2`,
      [a, b],
    );
    if (existing.rows.length) {
      const m = existing.rows[0];
      if (m.status === 'unmatched') {
        await client.query(`UPDATE matches SET status='active' WHERE id=$1`, [m.id]);
      }
      return { matched: true as const, matchId: m.id, channelId: m.chat_channel_id };
    }

    const channelId = await createChannel(a, b);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO matches (user_a_id, user_b_id, chat_channel_id, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [a, b, channelId],
    );
    return { matched: true as const, matchId: ins.rows[0].id, channelId };
  });

  if (result.matched) {
    // Notify the other user of the new match (best-effort).
    sendPushToUser(swipee_id, 'New match! 🎉', 'You have a new match — say hi!', { type: 'match', match_id: result.matchId });
    return res.status(201).json({
      matched: true,
      match: { id: result.matchId, chat_channel_id: result.channelId, other_user_id: swipee_id },
    });
  }
  res.status(201).json({ matched: false });
}));

// GET /v1/matches — active matches with the other user's basic profile
router.get('/matches', asyncHandler(async (req, res) => {
  const me = req.userId!;
  const { rows } = await query(
    `
    SELECT m.id, m.chat_channel_id, m.created_at,
           other.user_id AS other_user_id, other.display_name, other.city, other.is_verified,
           (SELECT url FROM photos ph
              WHERE ph.user_id = other.user_id AND ph.moderation_status='approved'
              ORDER BY ph.position LIMIT 1) AS primary_photo
    FROM matches m
    JOIN profiles other
      ON other.user_id = CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END
    WHERE (m.user_a_id = $1 OR m.user_b_id = $1) AND m.status = 'active'
    ORDER BY m.created_at DESC
    `,
    [me],
  );
  res.json({ matches: rows });
}));

// POST /v1/matches/:id/unmatch — end a match, close chat channel
router.post('/matches/:id/unmatch', asyncHandler(async (req, res) => {
  const me = req.userId!;
  const { rows } = await query<{ chat_channel_id: string | null }>(
    `UPDATE matches SET status='unmatched'
      WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2) AND status='active'
      RETURNING chat_channel_id`,
    [req.params.id, me],
  );
  if (!rows.length) throw ApiError.notFound('Match not found');
  if (rows[0].chat_channel_id) await closeChannel(rows[0].chat_channel_id);
  res.json({ ok: true });
}));

export default router;
