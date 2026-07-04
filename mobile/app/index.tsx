import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../src/theme';

// The routing gate in _layout.tsx redirects away from here based on auth status.
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
