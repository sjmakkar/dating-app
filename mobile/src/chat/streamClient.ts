import { StreamChat } from 'stream-chat';
import { chat } from '../api';

/**
 * Stream chat client (singleton). Uses the PUBLIC api key + a per-user token
 * minted by our backend (POST /v1/chat/token). We use the core stream-chat JS
 * client (pure JS) with our own message UI — lighter than the full RN UI kit and
 * works in Expo Go and dev builds. When no api key is set, chat falls back to the
 * self-hosted REST path.
 */
const apiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY;

let client: StreamChat | null = null;
let connectedUserId: string | null = null;
let connecting: Promise<void> | null = null;

export const isStreamEnabled = () => !!apiKey;

export function getStreamClient(): StreamChat | null {
  if (!apiKey) return null;
  if (!client) client = StreamChat.getInstance(apiKey);
  return client;
}

/** Connect (or reuse) the Stream user. Safe to call repeatedly. */
export async function ensureConnected(userId: string): Promise<StreamChat | null> {
  const c = getStreamClient();
  if (!c) return null;
  if (connectedUserId === userId && c.userID) return c;
  if (connecting) { await connecting; if (connectedUserId === userId) return c; }

  connecting = (async () => {
    if (c.userID && connectedUserId !== userId) {
      try { await c.disconnectUser(); } catch { /* ignore */ }
      connectedUserId = null;
    }
    const { chat_token } = await chat.token();
    await c.connectUser({ id: userId }, chat_token);
    connectedUserId = userId;
  })();
  try { await connecting; } finally { connecting = null; }
  return c;
}

export async function disconnectStream(): Promise<void> {
  if (client && client.userID) {
    try { await client.disconnectUser(); } catch { /* ignore */ }
  }
  connectedUserId = null;
}
