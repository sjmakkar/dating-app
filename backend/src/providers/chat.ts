/**
 * Managed chat provider adapter.
 *
 * Your backend does NOT proxy messages — it only creates/closes channels and
 * mints short-lived client tokens. When CHAT_PROVIDER=stream and keys are set,
 * this uses Stream; otherwise it falls back to a stub so matching still works.
 */
import crypto from 'crypto';
import { StreamChat } from 'stream-chat';
import { config } from '../config';

let streamServer: StreamChat | null = null;

/** Server-side Stream client (uses the API SECRET; never shipped to the app). */
function getStream(): StreamChat | null {
  if (config.chat.provider !== 'stream') return null;
  if (!config.chat.apiKey || !config.chat.apiSecret) return null;
  if (!streamServer) {
    streamServer = StreamChat.getInstance(config.chat.apiKey, config.chat.apiSecret);
  }
  return streamServer;
}

/** Create the 1:1 conversation for a new match; returns the channel id. */
export async function createChannel(userAId: string, userBId: string): Promise<string> {
  const s = getStream();
  if (!s) return `chan_${crypto.randomBytes(8).toString('hex')}`;

  await s.upsertUsers([{ id: userAId }, { id: userBId }]);
  const channel = s.channel('messaging', {
    members: [userAId, userBId],
    created_by_id: userAId,
  });
  await channel.create();
  return channel.id as string;
}

/** End a conversation (on unmatch/block). */
export async function closeChannel(channelId: string): Promise<void> {
  const s = getStream();
  if (!s) return;
  try {
    await s.channel('messaging', channelId).delete();
  } catch {
    // channel may already be gone; ignore
  }
}

/** Mint a short-lived token the app uses to talk to the chat SDK directly. */
export async function mintUserToken(userId: string): Promise<string> {
  const s = getStream();
  if (!s) {
    return `chat_tok_${crypto.createHash('sha256').update(userId + Date.now()).digest('hex').slice(0, 32)}`;
  }
  await s.upsertUser({ id: userId });
  return s.createToken(userId);
}
