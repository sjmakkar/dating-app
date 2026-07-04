import React, { useRef } from 'react';
import {
  Animated, PanResponder, StyleSheet, View, Text, Image, Dimensions,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Candidate } from '../types';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.28;

export function SwipeCard({
  candidate, onSwipe, isTop,
}: {
  candidate: Candidate;
  onSwipe: (dir: 'like' | 'pass') => void;
  isTop: boolean;
}) {
  const pan = useRef(new Animated.ValueXY()).current;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isTop && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) return fling('like', SCREEN_W * 1.5);
        if (g.dx < -SWIPE_THRESHOLD) return fling('pass', -SCREEN_W * 1.5);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
      },
    }),
  ).current;

  const fling = (dir: 'like' | 'pass', toX: number) => {
    Animated.timing(pan, { toValue: { x: toX, y: 0 }, duration: 220, useNativeDriver: false }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      onSwipe(dir);
    });
  };

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const photo = candidate.photos?.[0]?.url;

  return (
    <Animated.View
      {...(isTop ? responder.panHandlers : {})}
      style={[
        styles.card,
        isTop
          ? { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }
          : { transform: [{ scale: 0.96 }], top: 10 },
      ]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Text style={styles.noPhotoText}>{candidate.display_name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <Animated.View style={[styles.badge, styles.likeBadge, { opacity: likeOpacity }]}>
        <Text style={[styles.badgeText, { color: colors.like }]}>LIKE</Text>
      </Animated.View>
      <Animated.View style={[styles.badge, styles.passBadge, { opacity: passOpacity }]}>
        <Text style={[styles.badgeText, { color: colors.pass }]}>NOPE</Text>
      </Animated.View>

      <View style={styles.info}>
        <Text style={styles.name}>
          {candidate.display_name}, {candidate.age} {candidate.is_verified ? '✔️' : ''}
        </Text>
        <Text style={styles.meta}>{candidate.distance_label}{candidate.city ? ` · ${candidate.city}` : ''}</Text>
        {candidate.bio ? <Text style={styles.bio} numberOfLines={2}>{candidate.bio}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  photo: { width: '100%', height: '100%' },
  noPhoto: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: colors.white, fontSize: 96, fontWeight: '800' },
  info: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  name: { color: colors.white, fontSize: 26, fontWeight: '800' },
  meta: { color: colors.white, fontSize: 15, marginTop: 2, opacity: 0.95 },
  bio: { color: colors.white, fontSize: 14, marginTop: 6, opacity: 0.95 },
  badge: {
    position: 'absolute', top: 40, paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 3, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.85)',
  },
  likeBadge: { left: 24, borderColor: colors.like, transform: [{ rotate: '-15deg' }] },
  passBadge: { right: 24, borderColor: colors.pass, transform: [{ rotate: '15deg' }] },
  badgeText: { fontSize: 28, fontWeight: '900' },
});
