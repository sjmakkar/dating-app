import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { devices } from '../api';

/**
 * Register for push notifications and save the Expo push token via /devices.
 *
 * Remote push requires a DEVELOPMENT/standalone build (not Expo Go), so we
 * short-circuit in Expo Go. expo-notifications is lazy-required so importing this
 * module never crashes Expo Go.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function registerForPush(): Promise<void> {
  if (isExpoGo) return;

  let Notifications: any;
  try {
    Notifications = require('expo-notifications');
  } catch {
    return; // module not installed
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token: string | undefined = tokenResult?.data;
    if (token) {
      await devices.register(token, Platform.OS === 'ios' ? 'ios' : 'android');
    }
  } catch {
    // Non-fatal — the app still works without push.
  }
}
