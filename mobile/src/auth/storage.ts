import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Token storage. expo-secure-store is unavailable on web, so we fall back to
 * in-memory there (fine for dev). Never store tokens in plain AsyncStorage.
 */
const ACCESS = 'access_token';
const REFRESH = 'refresh_token';

const memory: Record<string, string | null> = {};

const isWeb = Platform.OS === 'web';

async function set(key: string, value: string | null) {
  if (isWeb) {
    memory[key] = value;
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

async function get(key: string): Promise<string | null> {
  if (isWeb) return memory[key] ?? null;
  return SecureStore.getItemAsync(key);
}

export const tokenStore = {
  async save(access: string, refresh: string) {
    await set(ACCESS, access);
    await set(REFRESH, refresh);
  },
  async setAccess(access: string) {
    await set(ACCESS, access);
  },
  getAccess: () => get(ACCESS),
  getRefresh: () => get(REFRESH),
  async clear() {
    await set(ACCESS, null);
    await set(REFRESH, null);
  },
};
