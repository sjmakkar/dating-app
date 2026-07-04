import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { discovery, swipes } from '../../src/api';
import { ApiError } from '../../src/api/client';
import { Candidate } from '../../src/types';
import { SwipeCard } from '../../src/components/SwipeCard';
import { colors, radius, spacing } from '../../src/theme';

export default function Discover() {
  const router = useRouter();
  const [deck, setDeck] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await discovery.deck({ radius_km: 50 });
      setDeck(res.candidates);
      setIndex(0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load people nearby.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSwipe = useCallback(async (candidate: Candidate, dir: 'like' | 'pass') => {
    setIndex((i) => i + 1);
    try {
      const res = await swipes.send(candidate.user_id, dir);
      if (res.matched && res.match) {
        Alert.alert(
          "It's a match! 🎉",
          `You and ${candidate.display_name} liked each other.`,
          [
            { text: 'Keep swiping', style: 'cancel' },
            { text: 'Say hi', onPress: () => router.push({ pathname: '/chat/[id]', params: { id: res.match!.id, name: candidate.display_name, otherId: res.match!.other_user_id, channel: res.match!.chat_channel_id ?? '' } }) },
          ],
        );
      }
    } catch (e) {
      // Roll back the card on failure so the user can retry.
      if (e instanceof ApiError && e.status !== 409) {
        setIndex((i) => Math.max(0, i - 1));
        Alert.alert('Error', e.message);
      }
    }
  }, [router]);

  const current = deck[index];
  const next = deck[index + 1];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>spark</Text>
      </View>

      <View style={styles.stage}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : error ? (
          <Empty title="Something went wrong" subtitle={error} actionLabel="Retry" onAction={load} />
        ) : !current ? (
          <Empty
            title="That's everyone for now"
            subtitle="Check back later or widen your distance to see more people."
            actionLabel="Refresh"
            onAction={load}
          />
        ) : (
          <>
            {next && <SwipeCard key={next.user_id} candidate={next} isTop={false} onSwipe={() => {}} />}
            <SwipeCard key={current.user_id} candidate={current} isTop onSwipe={(dir) => onSwipe(current, dir)} />
          </>
        )}
      </View>

      {current && !loading && !error ? (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.fab, styles.pass]} onPress={() => onSwipe(current, 'pass')}>
            <Text style={styles.fabIcon}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, styles.like]} onPress={() => onSwipe(current, 'like')}>
            <Text style={styles.fabIcon}>♥</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Empty({ title, subtitle, actionLabel, onAction }: { title: string; subtitle: string; actionLabel: string; onAction: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{subtitle}</Text>
      <TouchableOpacity style={styles.retry} onPress={onAction}>
        <Text style={styles.retryText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  logo: { fontSize: 24, fontWeight: '900', color: colors.primary },
  stage: { flex: 1, margin: spacing.lg, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingBottom: spacing.lg },
  fab: {
    width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  pass: { borderWidth: 2, borderColor: colors.pass },
  like: { borderWidth: 2, borderColor: colors.like },
  fabIcon: { fontSize: 28, fontWeight: '900', color: colors.text },
  empty: { alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  emptySub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  retry: { paddingVertical: 12, paddingHorizontal: 28, backgroundColor: colors.primary, borderRadius: radius.pill },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
