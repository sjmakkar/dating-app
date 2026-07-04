import React, { useState } from 'react';
import { View, Alert, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Title, Subtitle } from '../../src/components/ui';
import { auth } from '../../src/api';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, spacing } from '../../src/theme';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const session = await auth.phoneVerify(phone, code.trim());
      await signIn(session); // routing gate moves us to onboarding or the app
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Verification failed.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Title>Enter the code</Title>
          <Subtitle>Sent to {phone}. (Dev build: the code is 000000.)</Subtitle>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoFocus
            maxLength={6}
            placeholder="000000"
          />
        </View>
        <View>
          <Button title="Verify" onPress={verify} loading={loading} disabled={code.length < 4} />
          <Text style={styles.hint}>Didn't get it? Go back and resend.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
