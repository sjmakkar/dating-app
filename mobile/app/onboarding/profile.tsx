import React, { useState } from 'react';
import {
  View, Alert, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Button, Field, Title, Subtitle } from '../../src/components/ui';
import { Select } from '../../src/components/Select';
import { me } from '../../src/api';
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

function eighteenYearsAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function prettyDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
function isAdult(d: Date): boolean {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 18;
}

type StepKey = 'about' | 'dob' | 'gender' | 'intent' | 'photo' | 'location';

export default function OnboardingProfile() {
  const { refreshMe, completeOnboarding } = useAuth();

  const [step, setStep] = useState(0);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent>('serious');
  const [city, setCity] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const steps: { key: StepKey; valid: () => boolean; error: string }[] = [
    { key: 'about', valid: () => displayName.trim().length > 0, error: 'Please add your name' },
    { key: 'dob', valid: () => !!birthDate && isAdult(birthDate), error: 'Select your birthday (18+)' },
    { key: 'gender', valid: () => !!gender, error: 'Select your gender' },
    { key: 'intent', valid: () => true, error: '' },
    { key: 'photo', valid: () => true, error: '' },
    { key: 'location', valid: () => !!coords, error: 'Tap “Use my current location” to continue' },
  ];
  const total = steps.length;
  const isLast = step === total - 1;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to add a picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setPhotoUploading(true);
    try {
      await me.uploadPhoto(uri);
    } catch (e) {
      setPhotoUri(null);
      Alert.alert('Upload failed', e instanceof ApiError ? e.message : 'Could not upload photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return Alert.alert('Permission needed', 'Allow location to find people near you.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setCity(place?.city || place?.subregion || place?.region || 'Located');
      } catch { setCity('Located'); }
    } catch {
      Alert.alert('Location error', 'Could not get your location. Try again.');
    } finally {
      setLocating(false);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event.type === 'set' && selected) setBirthDate(selected);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await me.updateProfile({
        display_name: displayName.trim(),
        birth_date: toISO(birthDate!),
        gender: gender!,
        intent,
        bio: bio.trim() || undefined,
        city: city || undefined,
        lat: coords!.lat,
        lng: coords!.lng,
      });
      await refreshMe();
      completeOnboarding();
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not save your profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = async () => {
    const cur = steps[step];
    if (!cur.valid()) return Alert.alert('Almost there', cur.error);
    if (isLast) return submit();
    setStep((s) => s + 1);
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const key = steps[step].key;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Progress */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / total) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {step + 1} of {total}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {key === 'about' && (
          <>
            <Title>What's your name?</Title>
            <Subtitle>This is how you'll appear to others.</Subtitle>
            <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Aanya" autoFocus />
            <Field label="Short bio (optional)" value={bio} onChangeText={setBio} placeholder="Coffee, trails, bad puns" multiline />
          </>
        )}

        {key === 'dob' && (
          <>
            <Title>Your birthday</Title>
            <Subtitle>You must be 18+. Only your age is shown, never your birth date.</Subtitle>
            <TouchableOpacity style={styles.pickerField} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
              <Text style={[styles.pickerText, !birthDate && styles.placeholder]}>
                {birthDate ? prettyDate(birthDate) : 'Select your date of birth'}
              </Text>
              <Text style={styles.calendar}>📅</Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={birthDate ?? eighteenYearsAgo()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={eighteenYearsAgo()}
                onChange={onDateChange}
              />
            )}
            {Platform.OS === 'ios' && showPicker && (
              <Button title="Done" variant="ghost" onPress={() => setShowPicker(false)} />
            )}
          </>
        )}

        {key === 'gender' && (
          <>
            <Title>How do you identify?</Title>
            <Subtitle>Pick the option that fits you best.</Subtitle>
            <Select label="Gender" value={gender} options={GENDERS} onChange={setGender} placeholder="Select your gender" />
          </>
        )}

        {key === 'intent' && (
          <>
            <Title>What are you looking for?</Title>
            <Subtitle>This helps us match you with the right people.</Subtitle>
            <View style={styles.row}>
              {INTENTS.map((it) => (
                <TouchableOpacity key={it.key} onPress={() => setIntent(it.key)} style={[styles.chip, intent === it.key && styles.chipActive]}>
                  <Text style={[styles.chipText, intent === it.key && styles.chipTextActive]}>{it.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {key === 'photo' && (
          <>
            <Title>Add a photo</Title>
            <Subtitle>Profiles with photos get far more matches. You can add more later.</Subtitle>
            <TouchableOpacity style={styles.photoWrap} onPress={pickPhoto} activeOpacity={0.8}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Text style={styles.photoPlus}>＋</Text>
                  <Text style={styles.photoHint}>Add photo</Text>
                </View>
              )}
              {photoUploading && (
                <View style={styles.photoOverlay}><ActivityIndicator color={colors.white} /></View>
              )}
            </TouchableOpacity>
          </>
        )}

        {key === 'location' && (
          <>
            <Title>Where are you?</Title>
            <Subtitle>We show a coarse distance only — never your exact location.</Subtitle>
            <TouchableOpacity style={styles.locationBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={colors.primary} /> : (
                <Text style={styles.locationText}>{city ? `📍 ${city} · tap to update` : '📍 Use my current location'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Nav */}
      <View style={styles.nav}>
        {step > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <View style={{ flex: 1 }}>
          <Button title={isLast ? 'Start matching' : 'Next'} onPress={goNext} loading={submitting} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progressText: { fontSize: 12, color: colors.textMuted, marginTop: 6, fontWeight: '600' },
  body: { padding: spacing.lg, flexGrow: 1 },
  row: { flexDirection: 'row', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 16 },
  chipTextActive: { color: colors.white },
  pickerField: {
    height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm,
  },
  pickerText: { fontSize: 16, color: colors.text },
  calendar: { fontSize: 18 },
  placeholder: { color: colors.textMuted },
  photoWrap: { alignSelf: 'center', marginTop: spacing.md },
  photo: { width: 140, height: 140, borderRadius: radius.pill, backgroundColor: colors.surface },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
  photoPlus: { fontSize: 40, color: colors.primary, fontWeight: '300', lineHeight: 42 },
  photoHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  photoOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  locationBtn: {
    height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginTop: spacing.sm,
  },
  locationText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  backBtn: { width: 72, height: 52, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textMuted, fontWeight: '700', fontSize: 16 },
});
