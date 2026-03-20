import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../constants/config';
import { AppState } from '../types';

interface Props {
  responseText: string;
  appState: AppState;
}

export function ResponseBox({ responseText, appState }: Props) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const isThinking = appState === 'thinking';

  useEffect(() => {
    if (isThinking) {
      const bounce = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0,  duration: 300, useNativeDriver: true }),
          ])
        );
      loopRef.current = Animated.parallel([
        bounce(dot1, 0),
        bounce(dot2, 150),
        bounce(dot3, 300),
      ]);
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      [dot1, dot2, dot3].forEach(d => d.setValue(0));
    }
  }, [isThinking]);

  return (
    <View style={styles.container}>
      {isThinking ? (
        <View style={styles.thinkingRow}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[styles.dot, { transform: [{ translateY: dot }] }]}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.text, !responseText && styles.placeholder]}>
          {responseText || 'Oshi\'s response will appear here…'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    minHeight: 64,
    justifyContent: 'center',
  },
  text: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  placeholder: { color: COLORS.textMuted, fontStyle: 'italic' },
  thinkingRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  dot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
});
