import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';
import { sendPushToUser } from '../providers/push';

const router = Router();
router.use(requireAuth);

interface MatchRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
}

/** Load a match and assert the caller is one of its two members. */
async function memberMatch(matchId: string, userId: string): Promise<MatchRow> {
  const { rows } = await query<MatchRow>(
    `SELECT id, user_a_id, user_b_id, status FROM matches WHERE id = $1`,
    [matchId],
  );
  const m = rows[0];
  if (!m || (m.user_a_id !== userId && m.user_b_id !== userId)) {
    throw ApiError.notFound('Match not found');
  }
  return m;
}

// GET /v1/matches/:id/messages?after=<ISO>&limit=<n>
// Returns messages oldest→newest. `after` (a timestamp) fetches only newer ones,
// which the client uses to poll for incoming messages.
router.get('/matches/:id/messages', asyncHandler(async (req, res) => {
  const me = req.userId!;
  await memberMatch(req.params.id, me);

  const { after, limit } = z.object({
    after: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(req.query);

  const { rows } = await query(
    `SELECT id, sender_id, body, created_at
       FROM messages
      WHERE match_id = $1
        AND ($2::timestamptz IS NULL OR created_at > $2)
      ORDER BY created_at ASC
      LIMIT $3`,
    [req.params.id, after ?? null, limit ?? 100],
  );
  res.json({ messages: rows });
}));

// POST /v1/matches/:id/messages  { body }
router.post('/matches/:id/messages', asyncHandler(async (req, res) => {
  const me = req.userId!;
  const match = await memberMatch(req.params.id, me);
  if (match.status !== 'active') {
    throw ApiError.forbidden('This conversation is closed', 'match_closed');
  }

  const { body } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);

  // Defensive: block in either direction closes messaging even if status lagged.
  const blocked = await query(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [match.user_a_id, match.user_b_id],
  );
  if (blocked.rows.length) throw ApiError.forbidden('This conversation is closed', 'match_closed');

  const { rows } = await query(
    `INSERT INTO messages (match_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, body, created_at`,
    [req.params.id, me, body.trim()],
  );
  // Notify the other member (best-effort). Only for self-hosted chat — with a
  // managed provider (Stream) configure message push in its dashboard instead.
  const recipientId = match.user_a_id === me ? match.user_b_id : match.user_a_id;
  const sender = await query<{ display_name: string }>(
    `SELECT display_name FROM profiles WHERE user_id = $1`, [me],
  );
  const senderName = sender.rows[0]?.display_name ?? 'New message';
  const preview = body.length > 80 ? body.slice(0, 77) + '…' : body;
  sendPushToUser(recipientId, senderName, preview, { type: 'message', match_id: req.params.id });

  res.status(201).json(rows[0]);
}));

export default router;
