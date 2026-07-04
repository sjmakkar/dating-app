import React, { useState } from 'react';
import {
  View, ScrollView, Alert, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Button, Field, Subtitle } from '../../src/components/ui';
import { Select } from '../../src/components/Select';
import { me as meApi } from '../../src/api';
import { ApiError } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, radius, spacing } from '../../src/theme';
import { Intent } from '../../src/types';

const INTENTS: { key: Intent; label: string }[] = [
  { key: 'serious', label: 'Serious' },
  { key: 'casual', label: 'Casual' },
  { key: 'friends', label: 'Friends' },
];

const GENDERS = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Non-binary', value: 'non-binary' },
  { label: 'Genderfluid', value: 'genderfluid' },
  { label: 'Agender', value: 'agender' },
  { label: 'Transgender woman', value: 'trans-woman' },
  { label: 'Transgender man', value: 'trans-man' },
  { label: 'Prefer not to say', value: 'unspecified' },
];

export default function EditProfile() {
  const router = useRouter();
  const { me, refreshMe } = useAuth();
  const profile = me?.profile;

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [gender, setGender] = useState<string | null>(profile?.gender ?? null);
  const [intent, setIntent] = useState<Intent>(profile?.intent ?? 'serious');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [city, setCity] = useState<string | null>(profile?.city ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState(me?.photos ?? []);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to add a picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    setBusyPhoto(true);
    try {
      const uploaded = await meApi.uploadPhoto(result.assets[0].uri);
      const fresh = await refreshMe();
      setPhotos(fresh?.photos ?? [...photos, uploaded as any]);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof ApiError ? e.message : 'Could not upload photo.');
    } finally {
      setBusyPhoto(false);
    }
  };

  const removePhoto = (id?: string) => {
    if (!id) return;
    Alert.alert('Remove photo', 'Delete this photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await meApi.deletePhoto(id);
          const fresh = await refreshMe();
          setPhotos(fresh?.photos ?? photos.filter((p) => p.id !== id));
        } catch (e) {
          Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not delete photo.');
        }
      } },
    ]);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return Alert.alert('Permission needed', 'Allow location to update your area.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setCity(place?.city || place?.subregion || place?.region || 'Located');
      } catch { setCity('Located'); }
    } catch {
      Alert.alert('Location error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!displayName.trim()) return Alert.alert('Add your name');
    if (!gender) return Alert.alert('Select your gender');
    setSaving(true);
    try {
      await meApi.updateProfile({
        display_name: displayName.trim(),
        gender,
        intent,
        bio: bio.trim(),
        city: city || undefined,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      await refreshMe();
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Edit profile' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Subtitle>Update anything below. Changes show to others right away.</Subtitle>

        <Text style={styles.label}>Photos</Text>
        <View style={styles.photoGrid}>
          {photos.map((p) => (
            <TouchableOpacity key={p.id ?? p.url} onLongPress={() => removePhoto(p.id)} activeOpacity={0.8}>
              <Image source={{ uri: p.url }} style={styles.photo} />
              {p.moderation_status && p.moderation_status !== 'approved' ? (
                <View style={styles.pending}><Text style={styles.pendingText}>{p.moderation_status}</Text></View>
              ) : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.photo, styles.addPhoto]} onPress={addPhoto} disabled={busyPhoto}>
            {busyPhoto ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.addPlus}>＋</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>Long-press a photo to remove it.</Text>

        <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />

        <Select label="Gender" value={gender} options={GENDERS} onChange={setGender} placeholder="Select your gender" />

        <Text style={styles.label}>Looking for</Text>
        <View style={styles.row}>
          {INTENTS.map((it) => (
            <TouchableOpacity key={it.key} onPress={() => setIntent(it.key)} style={[styles.chip, intent === it.key && styles.chipActive]}>
              <Text style={[styles.chipText, intent === it.key && styles.chipTextActive]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="A little about you" multiline />

        <Text style={styles.label}>Location</Text>
        <TouchableOpacity style={styles.locationBtn} onPress={useMyLocation} disabled={locating}>
          {locating ? <ActivityIndicator color={colors.primary} /> : (
            <Text style={styles.locationText}>{city ? `📍 ${city} · tap to update` : '📍 Update my location'}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: spacing.md }} />
        <Button title="Save changes" onPress={save} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '600' },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  row: { flexDirection: 'row', marginBottom: spacing.md },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
  addPlus: { fontSize: 30, color: colors.primary, fontWeight: '300' },
  pending: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 2, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  pendingText: { color: colors.white, fontSize: 10, textAlign: 'center' },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  locationBtn: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  locationText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
