import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorMiddleware } from './errors';
import { UPLOADS_DIR } from './routes/profile';

import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import discoveryRoutes from './routes/discovery';
import swipeRoutes from './routes/swipes';
import chatRoutes from './routes/chat';
import safetyRoutes from './routes/safety';
import messageRoutes from './routes/messages';
import deviceRoutes from './routes/devices';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct req.ip behind a proxy (rate limiting)
  app.use(helmet({ crossOriginResourcePolicy: false })); // allow images to load cross-origin
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Serve uploaded profile photos (Phase 1 local storage; swap for CDN in prod).
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Versioned under /v1
  app.use('/v1/auth', authRoutes);
  app.use('/v1/me', profileRoutes);
  app.use('/v1/discovery', discoveryRoutes);
  app.use('/v1', swipeRoutes);          // /v1/swipes, /v1/matches, /v1/matches/:id/unmatch
  app.use('/v1/chat', chatRoutes);
  app.use('/v1', messageRoutes);       // /v1/matches/:id/messages
  app.use('/v1', safetyRoutes);         // /v1/blocks, /v1/reports
  app.use('/v1/devices', deviceRoutes);

  app.use(errorMiddleware);
  return app;
}
