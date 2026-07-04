import Constants from 'expo-constants';

/**
 * API base URL resolution order:
 *   1. EXPO_PUBLIC_API_URL (build-time env)
 *   2. expo.extra.apiUrl in app.json
 *   3. localhost fallback
 */
const fromEnv = process.env.EXPO_PUBLIC_API_URL;
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

export const API_URL = fromEnv || fromExtra || 'http://localhost:4000';

export const API_BASE = `${API_URL.replace(/\/$/, '')}/v1`;
