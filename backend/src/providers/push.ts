/**
 * Push notifications via Expo's push service.
 *
 * Clients register an Expo push token (saved in devices.fcm_token). Expo relays
 * to FCM (Android) / APNs (iOS), so we don't call FCM/APNs directly. Sending is
 * best-effort and never blocks the request that triggered it.
 */
import { query } from '../db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
}

async function tokensForUser(userId: string): Promise<string[]> {
  const { rows } = await query<{ fcm_token: string }>(
    `SELECT fcm_token FROM devices WHERE user_id = $1`,
    [userId],
  );
  // Expo tokens look like ExponentPushToken[xxx] / ExpoPushToken[xxx].
  return rows.map((r) => r.fcm_token).filter((t) => /^Expo(nent)?PushToken\[/.test(t));
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const tokens = await tokensForUser(userId);
    if (!tokens.length) return;
    const messages: ExpoMessage[] = tokens.map((to) => ({ to, title, body, data, sound: 'default' }));
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch {
    // Non-fatal: never let a push failure break the API call.
  }
}
