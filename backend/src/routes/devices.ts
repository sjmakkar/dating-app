import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';

const router = Router();
router.use(requireAuth);

// POST /v1/devices — register/refresh the FCM push token for this device.
router.post('/', asyncHandler(async (req, res) => {
  const { fcm_token, platform } = z.object({
    fcm_token: z.string().min(1),
    platform: z.enum(['ios', 'android']),
  }).parse(req.body);

  // Token is globally unique; re-registering re-points it at the current user.
  const { rows } = await query<{ id: string }>(
    `INSERT INTO devices (user_id, fcm_token, platform, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (fcm_token)
       DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()
     RETURNING id`,
    [req.userId, fcm_token, platform],
  );
  res.status(201).json({ id: rows[0].id });
}));

// DELETE /v1/devices/:id — remove a token (e.g. on logout).
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM devices WHERE id=$1 AND user_id=$2`, [req.params.id, req.userId]);
  if (!rowCount) throw ApiError.notFound('Device not found');
  res.json({ ok: true });
}));

export default router;
