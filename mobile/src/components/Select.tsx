import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, Pressable,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface Option {
  label: string;
  value: string;
}

/**
 * A tap-to-open modal dropdown. Modern bottom-sheet style, no native picker
 * quirks, works identically on iOS/Android/web.
 */
export function Select({
  label, value, options, onChange, placeholder = 'Select…',
}: {
  label?: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.fieldText, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.handle} />
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => {
                const isSel = item.value === value;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => { onChange(item.value); setOpen(false); }}
                  >
                    <Text style={[styles.rowText, isSel && styles.rowTextSel]}>{item.label}</Text>
                    {isSel ? <Text style={styles.check}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, fontWeight: '600' },
  field: {
    height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldText: { fontSize: 16, color: colors.text },
  placeholder: { color: colors.textMuted },
  chevron: { fontSize: 16, color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm, maxHeight: '70%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowText: { fontSize: 16, color: colors.text },
  rowTextSel: { color: colors.primary, fontWeight: '700' },
  check: { fontSize: 16, color: colors.primary, fontWeight: '800' },
});
