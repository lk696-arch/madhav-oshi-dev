import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/config';
import { Emotion } from '../types';

const EMOTION_ICONS: Record<Emotion, string> = {
  neutral:   '😐',
  happy:     '😊',
  excited:   '🤩',
  shy:       '😳',
  sad:       '😢',
  surprised: '😲',
  focused:   '🧐',
  playful:   '😜',
};

interface Props {
  emotion: Emotion;
  intensity: number;
}

export function EmotionBadge({ emotion, intensity }: Props) {
  const pct = Math.round(intensity * 100);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{EMOTION_ICONS[emotion]}</Text>
      <Text style={styles.label}>{emotion}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  icon: { fontSize: 16 },
  label: {
    color: COLORS.accent,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  barTrack: {
    width: 64,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
});
