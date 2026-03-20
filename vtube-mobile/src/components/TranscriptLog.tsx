import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { COLORS } from '../constants/config';
import { Turn } from '../types';

interface Props {
  turns: Turn[];
}

export function TranscriptLog({ turns }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new turn is added
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [turns.length]);

  if (turns.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Say something to Oshi…</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      {turns.map((turn) => (
        <View key={turn.id} style={styles.turn}>
          <Text style={styles.label}>{turn.role === 'user' ? 'You' : 'Oshi'}</Text>
          <View style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.oshiBubble]}>
            <Text style={styles.bubbleText}>{turn.text}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 12, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontStyle: 'italic' },
  turn: { gap: 3 },
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.textMuted,
    marginHorizontal: 4,
  },
  bubble: {
    maxWidth: '88%',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.border,
    borderBottomRightRadius: 2,
  },
  oshiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(167,139,250,0.1)',
    borderColor: 'rgba(167,139,250,0.3)',
    borderBottomLeftRadius: 2,
  },
  bubbleText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
});
