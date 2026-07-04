import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { auth } from '../api';
import { SessionResponse } from '../types';

/**
 * Native Google + Apple sign-in.
 *
 * The underlying native modules exist only in a DEVELOPMENT BUILD, not Expo Go.
 * In Expo Go we must not even `require` them — evaluating the module triggers a
 * fatal TurboModule error. So we first detect Expo Go via expo-constants and
 * short-circuit with a friendly message; in a dev build the real modules load.
 */

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const DEV_BUILD_MSG =
  'This sign-in method needs a development build — it is not available in Expo Go.';

function getGoogleSignin(): any | null {
  if (isExpoGo) return null;
  try {
    return require('@react-native-google-signin/google-signin').GoogleSignin ?? null;
  } catch {
    return null;
  }
}

function getAppleAuth(): any | null {
  if (isExpoGo) return null;
  try {
    return require('expo-apple-authentication');
  } catch {
    return null;
  }
}

let googleConfigured = false;

export function configureGoogle() {
  if (googleConfigured) return;
  const GoogleSignin = getGoogleSignin();
  if (!GoogleSignin) return;
  // webClientId makes the returned idToken's audience = your Web client, which
  // the backend verifies. iosClientId is optional (iOS builds only).
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<SessionResponse> {
  const GoogleSignin = getGoogleSignin();
  if (!GoogleSignin) throw new Error(DEV_BUILD_MSG);
  configureGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result: any = await GoogleSignin.signIn();
  // v13+ returns { type, data: { idToken } }; older returns { idToken } directly.
  const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token');
  return auth.google(idToken);
}

export const isAppleAvailable = Platform.OS === 'ios' && !isExpoGo;

export async function signInWithApple(): Promise<SessionResponse> {
  const AppleAuthentication = getAppleAuth();
  if (!AppleAuthentication) throw new Error(DEV_BUILD_MSG);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token');
  // Apple gives the name only on the first authorization — forward it now.
  const fullName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
    : undefined;
  return auth.apple(credential.identityToken, fullName || undefined);
}
