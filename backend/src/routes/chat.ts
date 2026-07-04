import { Router } from 'express';
import { asyncHandler } from '../errors';
import { requireAuth } from '../middleware/auth';
import { mintUserToken } from '../providers/chat';

const router = Router();
router.use(requireAuth);

// POST /v1/chat/token — short-lived token for the managed chat SDK.
// The app then talks to the chat provider directly; backend never proxies messages.
router.post('/token', asyncHandler(async (req, res) => {
  const token = await mintUserToken(req.userId!);
  res.json({ user_id: req.userId, chat_token: token, provider: process.env.CHAT_PROVIDER ?? 'stub' });
}));

export default router;
