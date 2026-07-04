import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { chat, swipes, safety, ChatMessage } from '../../src/api';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { isStreamEnabled, ensureConnected } from '../../src/chat/streamClient';
import { colors, radius, spacing } from '../../src/theme';

const POLL_MS = 3000;

function normStream(m: any): ChatMessage {
  return {
    id: m.id,
    sender_id: m.user?.id ?? '',
    body: m.text ?? '',
    created_at: (m.created_at ? new Date(m.created_at) : new Date()).toISOString(),
  };
}

export default function ChatScreen() {
  const { id, name, otherId, channel } = useLocalSearchParams<{ id: string; name: string; otherId: string; channel: string }>();
  const router = useRouter();
  const { userId } = useAuth();

  const useStream = isStreamEnabled() && !!channel;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const lastTsRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

  const mergeNew = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastTsRef.current = merged[merged.length - 1]?.created_at ?? lastTsRef.current;
      return merged;
    });
  }, []);

  // ── Stream mode ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!useStream || !userId) return;
    let active = true;
    let handler: any;
    let ch: any;
    (async () => {
      try {
        const client = await ensureConnected(userId);
        if (!client || !active) return;
        ch = client.channel('messaging', channel);
        await ch.watch();
        channelRef.current = ch;
        if (!active) return;
        setMessages(ch.state.messages.map(normStream));
        setLoading(false);
        handler = (ev: any) => { if (ev.message) mergeNew([normStream(ev.message)]); };
        ch.on('message.new', handler);
      } catch (e) {
        if (active) { setLoading(false); Alert.alert('Chat error', 'Could not connect to chat.'); }
      }
    })();
    return () => {
      active = false;
      if (ch && handler) ch.off('message.new', handler);
    };
  }, [useStream, userId, channel, mergeNew]);

  // ── REST fallback: initial load + polling ────────────────────────────────
  useEffect(() => {
    if (useStream) return;
    let active = true;
    chat.list(id)
      .then((r) => { if (active) mergeNew(r.messages); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [useStream, id, mergeNew]);

  useEffect(() => {
    if (useStream) return;
    const t = setInterval(() => {
      chat.list(id, lastTsRef.current ?? undefined).then((r) => mergeNew(r.messages)).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [useStream, id, mergeNew]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      if (useStream && channelRef.current) {
        await channelRef.current.sendMessage({ text: body }); // echoes back via message.new
      } else {
        const msg = await chat.send(id, body);
        mergeNew([msg]);
      }
    } catch (e) {
      setDraft(body);
      Alert.alert('Not sent', e instanceof ApiError ? e.message : 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const unmatch = () => {
    Alert.alert('Unmatch', `Remove your match with ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unmatch', style: 'destructive', onPress: async () => {
        try { await swipes.unmatch(id); } catch { /* ignore */ }
        router.back();
      } },
    ]);
  };

  const block = () => {
    if (!otherId) return;
    Alert.alert('Block', `Block ${name}? This removes the match and hides you from each other.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
        try { await safety.block(otherId); } catch { /* ignore */ }
        router.back();
      } },
    ]);
  };

  const report = () => {
    if (!otherId) return;
    const submit = async (reason: string) => {
      try { await safety.report(otherId, reason); Alert.alert('Thanks', 'Our team will review this report.'); }
      catch (e) { Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not submit report.'); }
    };
    Alert.alert('Report ' + (name ?? 'user'), 'Why are you reporting?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Harassment', onPress: () => submit('harassment') },
      { text: 'Fake profile', onPress: () => submit('fake') },
      { text: 'Inappropriate', onPress: () => submit('explicit') },
    ]);
  };

  const openMenu = () => {
    Alert.alert(name ?? 'Options', undefined, [
      { text: 'Report', onPress: report },
      { text: 'Block', style: 'destructive', onPress: block },
      { text: 'Unmatch', style: 'destructive', onPress: unmatch },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const mine = item.sender_id === userId;
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: name ?? 'Chat',
        headerRight: () => (
          <TouchableOpacity onPress={openMenu} hitSlop={12}><Text style={styles.headerBtn}>•••</Text></TouchableOpacity>
        ),
      }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>You matched with {name} 🎉</Text>
            <Text style={styles.emptySub}>Say hello — send the first message.</Text>
          </View>
        ) : (
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.md }}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={`Message ${name ?? ''}`}
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            onSubmitEditing={send}
          />
          <TouchableOpacity style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]} onPress={send} disabled={!draft.trim() || sending}>
            <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  emptySub: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: colors.text },
  bubbleTextMine: { color: colors.white },
  composer: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingTop: 11, color: colors.text, backgroundColor: colors.surface, marginRight: spacing.sm,
  },
  send: { paddingVertical: 12, paddingHorizontal: 18, backgroundColor: colors.primary, borderRadius: radius.pill },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: colors.white, fontWeight: '700' },
  headerBtn: { color: colors.primary, fontWeight: '800', fontSize: 18, paddingHorizontal: 4 },
});
