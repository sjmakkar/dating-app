import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { colors } from '../src/theme';

/**
 * Routing gate — sends the user to the right area based on auth status:
 *   signedOut       → (auth)
 *   needsOnboarding → onboarding
 *   ready           → (tabs)   (but free to visit sub-routes like profile/edit, chat/[id])
 */
function RootNavigator() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === 'onboarding';

    if (status === 'signedOut' && !inAuth) {
      router.replace('/(auth)/phone');
    } else if (status === 'needsOnboarding' && !inOnboarding) {
      router.replace('/onboarding/profile');
    } else if (status === 'ready' && (inAuth || inOnboarding || group === undefined)) {
      router.replace('/(tabs)/discover');
    }
  }, [status, segments, router]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Chat', presentation: 'card' }} />
      <Stack.Screen name="profile/edit" options={{ headerShown: true, title: 'Edit profile', presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
