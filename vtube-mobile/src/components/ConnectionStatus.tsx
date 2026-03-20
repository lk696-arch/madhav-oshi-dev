import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../constants/config';
import { ConnectionStatus as ConnStatus } from '../hooks/useWebSocket';

const STATUS_CONFIG: Record<ConnStatus, { color: string; label: string }> = {
  connecting:   { color: COLORS.warning,  label: 'Connecting…' },
  connected:    { color: COLORS.success,  label: 'Connected' },
  disconnected: { color: COLORS.danger,   label: 'Disconnected — retrying…' },
  error:        { color: COLORS.danger,   label: 'Connection error' },
};

interface Props {
  status: ConnStatus;
  sessionId: string | null;
}

export function ConnectionStatus({ status, sessionId }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const { color, label } = STATUS_CONFIG[status];

  useEffect(() => {
    if (status === 'connecting') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [status]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} />
      <Text style={styles.label}>{label}</Text>
      {sessionId && (
        <Text style={styles.session}>{sessionId.slice(0, 8)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
  session: { color: COLORS.textMuted, fontSize: 10, fontFamily: 'monospace', opacity: 0.5 },
});
