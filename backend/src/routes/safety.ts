import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { withTransaction, query } from '../db';
import { closeChannel } from '../providers/chat';

const router = Router();
router.use(requireAuth);

function canonical(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * POST /v1/blocks — block a user. A block is ABSOLUTE: it unmatches the pair,
 * closes any chat channel, and hides them from each other everywhere (discovery
 * and matching already exclude blocked pairs in both directions).
 */
router.post('/blocks', asyncHandler(async (req, res) => {
  const { blocked_id } = z.object({ blocked_id: z.string().uuid() }).parse(req.body);
  const me = req.userId!;
  if (blocked_id === me) throw ApiError.badRequest('Cannot block yourself');

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [me, blocked_id],
    );
    const [a, b] = canonical(me, blocked_id);
    const { rows } = await client.query<{ chat_channel_id: string | null }>(
      `UPDATE matches SET status='unmatched'
        WHERE user_a_id=$1 AND user_b_id=$2 AND status='active'
        RETURNING chat_channel_id`,
      [a, b],
    );
    if (rows[0]?.chat_channel_id) await closeChannel(rows[0].chat_channel_id);
  });
  res.status(201).json({ ok: true });
}));

// POST /v1/reports — report a user with a reason for moderator review.
router.post('/reports', asyncHandler(async (req, res) => {
  const { reported_id, reason, detail } = z.object({
    reported_id: z.string().uuid(),
    reason: z.string().min(1).max(40),
    detail: z.string().max(1000).optional(),
  }).parse(req.body);
  const me = req.userId!;
  if (reported_id === me) throw ApiError.badRequest('Cannot report yourself');

  const { rows } = await query<{ id: string }>(
    `INSERT INTO reports (reporter_id, reported_id, reason, detail)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [me, reported_id, reason, detail ?? null],
  );
  res.status(201).json({ id: rows[0].id, status: 'open' });
}));

export default router;
