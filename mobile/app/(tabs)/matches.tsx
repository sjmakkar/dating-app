import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { swipes } from '../../src/api';
import { Match } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await swipes.matches();
      setMatches(res.matches);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab gains focus (new matches from swiping).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (m: Match) =>
    router.push({ pathname: '/chat/[id]', params: { id: m.id, name: m.display_name, otherId: m.other_user_id, channel: m.chat_channel_id ?? '' } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Matches</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : matches.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptySub}>When you and someone like each other, they'll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => open(item)} activeOpacity={0.7}>
              {item.primary_photo ? (
                <Image source={{ uri: item.primary_photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{item.display_name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.display_name} {item.is_verified ? '✔️' : ''}</Text>
                <Text style={styles.sub}>{item.city ?? 'Tap to say hi'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { fontSize: 28, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, marginRight: spacing.md, backgroundColor: colors.surface },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.white, fontSize: 22, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 28, color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  emptySub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
