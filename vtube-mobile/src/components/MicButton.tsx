/**
 * MicButton.tsx — Push-to-talk button with press animation
 *
 * Uses PanResponder (not TouchableOpacity) so we can detect both press-down
 * and press-release for push-to-talk behavior.
 */

import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, PanResponder, Animated, Platform,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { COLORS } from '../constants/config';
import { AppState } from '../types';

interface Props {
  appState: AppState;
  isRecording: boolean;
  isInitialized: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function MicButton({ appState, isRecording, isInitialized, onPressIn, onPressOut }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const isDisabled = !isInitialized || !['idle', 'recording'].includes(appState);

  // Scale feedback on press
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isRecording ? 0.92 : 1,
      tension: 200,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isRecording]);

  // Pulsing ring animation while recording
  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isDisabled,
      onPanResponderGrant: () => onPressIn(),
      onPanResponderRelease: () => onPressOut(),
      onPanResponderTerminate: () => onPressOut(),
    })
  ).current;

  const btnColor  = isRecording ? COLORS.danger : COLORS.accent;
  const bgColor   = isRecording ? 'rgba(248,113,113,0.15)' : 'rgba(167,139,250,0.12)';
  const labelText = isRecording ? 'Release' : appState === 'thinking' ? 'Thinking…' : appState === 'speaking' ? 'Speaking…' : 'Hold to Talk';

  return (
    <View style={styles.wrapper}>
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            borderColor: btnColor,
            transform: [{ scale: pulseAnim }],
            opacity: isRecording ? 0.35 : 0,
          },
        ]}
      />

      {/* Button */}
      <Animated.View
        style={[styles.button, { backgroundColor: bgColor, borderColor: btnColor, transform: [{ scale: scaleAnim }], opacity: isDisabled ? 0.45 : 1 }]}
        {...panResponder.panHandlers}
      >
        <MicIcon color={btnColor} active={isRecording} />
        <Text style={[styles.label, { color: btnColor }]}>{labelText}</Text>
      </Animated.View>
    </View>
  );
}

function MicIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M19 10v2a7 7 0 0 1-14 0v-2"
        stroke={color} strokeWidth={2} strokeLinecap="round"
      />
      <Line x1={12} y1={19} x2={12} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={8}  y1={23} x2={16} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    borderWidth: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});
