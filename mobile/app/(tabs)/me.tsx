import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui';
import { useAuth } from '../../src/auth/AuthContext';
import { me as meApi } from '../../src/api';
import { colors, radius, spacing } from '../../src/theme';

export default function Me() {
  const router = useRouter();
  const { me, refreshMe, signOut } = useAuth();
  const [verifying, setVerifying] = useState(false);

  const profile = me?.profile;
  const primaryPhoto = me?.photos?.find((p) => p.moderation_status === 'approved')?.url ?? me?.photos?.[0]?.url;

  const runVerify = async () => {
    setVerifying(true);
    try {
      await meApi.verify();
      await refreshMe();
      Alert.alert('Verified', 'Your profile is now verified.');
    } catch {
      Alert.alert('Error', 'Verification could not be completed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.head}>
          {primaryPhoto ? (
            <Image source={{ uri: primaryPhoto }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{profile?.display_name?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <Text style={styles.name}>
            {profile?.display_name ?? 'You'} {profile?.is_verified ? '✔️' : ''}
          </Text>
          <Text style={styles.meta}>
            {profile?.intent ? `Looking for ${profile.intent}` : ''}{profile?.city ? ` · ${profile.city}` : ''}
          </Text>
        </View>

        {profile?.bio ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>About</Text>
            <Text style={styles.cardText}>{profile.bio}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Photos</Text>
          <Text style={styles.cardText}>
            {me?.photos?.length
              ? `${me.photos.length} photo(s) · ${me.photos.filter((p) => p.moderation_status === 'approved').length} approved`
              : 'No photos yet. Add one from onboarding.'}
          </Text>
        </View>

        <Button title="Edit profile" onPress={() => router.push('/profile/edit')} />

        {!profile?.is_verified ? (
          <Button title="Verify my profile" onPress={runVerify} loading={verifying} variant="outline" />
        ) : null}

        <View style={{ height: spacing.lg }} />
        <Button title="Log out" variant="danger" onPress={() => {
          Alert.alert('Log out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => signOut() },
          ]);
        }} />

        <Text style={styles.footer}>Precise location is stored only for distance math and never shared. You must be 18+.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: radius.pill, marginBottom: spacing.md, backgroundColor: colors.surface },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.white, fontSize: 44, fontWeight: '800' },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  cardLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700', marginBottom: 4 },
  cardText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  footer: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18 },
});
