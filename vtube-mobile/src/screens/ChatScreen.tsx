/**
 * ChatScreen.tsx — Main screen
 *
 * Layout (portrait):
 * ┌─────────────────────────────┐
 * │  ConnectionStatus bar        │
 * ├─────────────────────────────┤
 * │                              │
 * │       AvatarCanvas           │  ~50% height
 * │                              │
 * │       EmotionBadge           │
 * ├─────────────────────────────┤
 * │  TranscriptLog (scrollable)  │  flex: 1
 * ├─────────────────────────────┤
 * │  ResponseBox                 │
 * │  ─────────────────────────── │
 * │  MicButton  +  AudioViz      │
 * │  TextInput  +  Send          │
 * └─────────────────────────────┘
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, Text,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

import { useWebSocket } from '../hooks/useWebSocket';
import { useVoice } from '../hooks/useVoice';
import { useEmotion } from '../hooks/useEmotion';

import { ConnectionStatus } from '../components/ConnectionStatus';
import { AvatarCanvas } from '../components/AvatarCanvas';
import { EmotionBadge } from '../components/EmotionBadge';
import { TranscriptLog } from '../components/TranscriptLog';
import { ResponseBox } from '../components/ResponseBox';
import { MicButton } from '../components/MicButton';
import { AudioVisualizer } from '../components/AudioVisualizer';

import { COLORS } from '../constants/config';
import { Turn } from '../types';

let turnIdCounter = 0;
const nextId = () => String(++turnIdCounter);

export function ChatScreen() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [responseText, setResponseText] = useState('');
  const [textInputValue, setTextInputValue] = useState('');

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { appState, setAppState, connectionStatus, sessionId, lastMessage, send } = useWebSocket();
  const { emotionState, animatedParams } = useEmotion({ lastMessage });
  const { isRecording, startRecording, stopRecording, micLevel, isInitialized } = useVoice({
    lastMessage,
    send,
    isConnected: connectionStatus === 'connected',
  });

  // ── React to server messages ───────────────────────────────────────────────
  React.useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'transcript':
        if (lastMessage.final) {
          addTurn('user', lastMessage.text);
        }
        break;

      case 'llm_response':
        setResponseText(lastMessage.text);
        addTurn('oshi', lastMessage.text);
        break;

      case 'error':
        if (lastMessage.code === 'SAFETY_BLOCK') {
          addTurn('oshi', "Hmm, I can't respond to that one. Ask me something else!");
          setResponseText('');
        }
        break;
    }
  }, [lastMessage]);

  const addTurn = useCallback((role: 'user' | 'oshi', text: string) => {
    setTurns(prev => [...prev, { id: nextId(), role, text, timestamp: Date.now() }]);
  }, []);

  // ── Text input send ────────────────────────────────────────────────────────
  const handleSendText = useCallback(() => {
    const text = textInputValue.trim();
    if (!text || appState !== 'idle') return;
    setTextInputValue('');
    send({ type: 'text_input', text });
    addTurn('user', text);
  }, [textInputValue, appState, send, addTurn]);

  const isIdle = appState === 'idle';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Connection status bar */}
        <ConnectionStatus status={connectionStatus} sessionId={sessionId} />

        {/* Avatar section */}
        <LinearGradient
          colors={['#1a0f2e', COLORS.bg]}
          style={styles.avatarSection}
        >
          <AvatarCanvas animatedParams={animatedParams} />
          <View style={styles.emotionBadgeWrapper}>
            <EmotionBadge
              emotion={emotionState.emotion}
              intensity={emotionState.intensity}
            />
          </View>
        </LinearGradient>

        {/* Chat section */}
        <View style={styles.chatSection}>

          {/* Transcript */}
          <View style={styles.transcriptContainer}>
            <TranscriptLog turns={turns} />
          </View>

          {/* Response box */}
          <ResponseBox responseText={responseText} appState={appState} />

          {/* Voice controls */}
          <View style={styles.voiceRow}>
            <MicButton
              appState={appState}
              isRecording={isRecording}
              isInitialized={isInitialized}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            />
            <AudioVisualizer isActive={isRecording} micLevel={micLevel} />
          </View>

          {/* Text input fallback */}
          <View style={styles.textRow}>
            <TextInput
              style={[styles.textInput, !isIdle && styles.textInputDisabled]}
              value={textInputValue}
              onChangeText={setTextInputValue}
              onSubmitEditing={handleSendText}
              placeholder="Type a message…"
              placeholderTextColor={COLORS.textMuted}
              editable={isIdle}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !isIdle && styles.sendBtnDisabled]}
              onPress={handleSendText}
              disabled={!isIdle}
              activeOpacity={0.75}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  emotionBadgeWrapper: {
    marginTop: 10,
  },

  // Chat panel
  chatSection: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  transcriptContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  // Voice row
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    justifyContent: 'center',
  },

  // Text input row
  textRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
  },
  textInputDisabled: { opacity: 0.45 },
  sendBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
