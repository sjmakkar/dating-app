import React, { useState } from 'react';
import { View, Alert, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Title, Subtitle } from '../../src/components/ui';
import { auth } from '../../src/api';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { signInWithGoogle, signInWithApple, isAppleAvailable } from '../../src/auth/social';
import { colors, spacing } from '../../src/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const start = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      Alert.alert('Invalid number', 'Enter your number in international format, e.g. +919812345678');
      return;
    }
    setLoading(true);
    try {
      await auth.phoneStart(phone);
      router.push({ pathname: '/(auth)/verify', params: { phone } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not send code. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      await signIn(session);
    } catch (e: any) {
      if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '-5') return; // user dismissed
      Alert.alert('Google sign-in failed', e instanceof ApiError ? e.message : (e?.message ?? 'Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const apple = async () => {
    setAppleLoading(true);
    try {
      const session = await signInWithApple();
      await signIn(session);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user dismissed
      Alert.alert('Apple sign-in failed', e instanceof ApiError ? e.message : (e?.message ?? 'Please try again.'));
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Title>What's your number?</Title>
          <Subtitle>We'll text you a code to verify. Standard rates apply.</Subtitle>
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
            placeholder="+919812345678"
          />
        </View>
        <View>
          <Button title="Continue" onPress={start} loading={loading} />
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>or</Text>
            <View style={styles.line} />
          </View>
          <Button title="Continue with Google" variant="outline" onPress={google} loading={googleLoading} />
          {isAppleAvailable ? (
            <Button title="Continue with Apple" variant="outline" onPress={apple} loading={appleLoading} />
          ) : null}
          <Text style={styles.legal}>By continuing you confirm you are 18 or older and agree to our Terms.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { marginHorizontal: spacing.sm, color: colors.textMuted },
  legal: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
});
