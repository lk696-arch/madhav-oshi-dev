import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../constants/config';

interface Props {
  isActive: boolean;
  micLevel: number;   // 0–1
}

const BAR_COUNT = 5;

export function AudioVisualizer({ isActive, micLevel }: Props) {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(4))
  ).current;

  useEffect(() => {
    if (isActive) {
      const animations = bars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 4 + micLevel * 20 * (0.6 + Math.random() * 0.4),
              duration: 120 + i * 30,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 4,
              duration: 120 + i * 30,
              useNativeDriver: false,
            }),
          ])
        )
      );
      animations.forEach(a => a.start());
      return () => animations.forEach(a => a.stop());
    } else {
      bars.forEach(bar => {
        Animated.spring(bar, { toValue: 4, useNativeDriver: false }).start();
      });
    }
  }, [isActive, micLevel]);

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { height: bar }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 24,
  },
  bar: {
    width: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
});
