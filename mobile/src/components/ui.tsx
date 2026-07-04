import React from 'react';
import {
  Text, TextInput, TextInputProps, TouchableOpacity, ActivityIndicator,
  StyleSheet, View, ViewProps, TextProps,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

export function Button({
  title, onPress, loading, disabled, variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
}) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    outline: { bg: 'transparent', fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.5 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Screen({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...props}>
      {children}
    </View>
  );
}

export function Title({ children, style, ...props }: TextProps) {
  return <Text style={[styles.title, style]} {...props}>{children}</Text>;
}

export function Subtitle({ children, style, ...props }: TextProps) {
  return <Text style={[styles.subtitle, style]} {...props}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  button: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginVertical: spacing.xs,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '600' },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 22 },
});
