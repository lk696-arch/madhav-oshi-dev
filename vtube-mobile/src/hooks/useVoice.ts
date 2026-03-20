/**
 * useVoice.ts — Hook managing mic recording and audio playback
 *
 * Coordinates AudioService with WebSocket sends:
 *   startRecording() → AudioService.startRecording()
 *   stopRecording()  → AudioService.stopRecording() → send audio_chunk + audio_end
 *
 * Audio playback:
 *   Listens for audio_chunk / audio_end messages via the passed lastMessage
 *   and drives AudioService.addChunk() / playBuffered().
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { audioService } from '../services/AudioService';
import { ServerMessage, ClientMessage } from '../types';

interface UseVoiceProps {
  lastMessage: ServerMessage | null;
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
}

interface UseVoiceReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  micLevel: number;        // 0–1 for visualizer (simulated in RN)
  isInitialized: boolean;
}

export function useVoice({ lastMessage, send, isConnected }: UseVoiceProps): UseVoiceReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micLevelRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize audio on mount
  useEffect(() => {
    audioService.init().then((granted) => {
      setIsInitialized(granted);
      if (!granted) console.warn('[useVoice] Mic permission denied');
    });

    return () => {
      audioService.cleanup();
    };
  }, []);

  // Handle incoming audio messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'audio_chunk') {
      audioService.addChunk(lastMessage.data);
    } else if (lastMessage.type === 'audio_end') {
      audioService.playBuffered();
    } else if (lastMessage.type === 'error') {
      audioService.clearChunks();
    }
  }, [lastMessage]);

  const startRecording = useCallback(async () => {
    if (!isInitialized || !isConnected) return;

    try {
      await audioService.startRecording();
      setIsRecording(true);

      // Simulate mic level animation (expo-av doesn't expose real-time levels)
      micLevelRef.current = setInterval(() => {
        setMicLevel(0.3 + Math.random() * 0.5);
      }, 80);
    } catch (err) {
      console.error('[useVoice] Start recording error:', err);
    }
  }, [isInitialized, isConnected]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    // Clear mic level animation
    if (micLevelRef.current) {
      clearInterval(micLevelRef.current);
      micLevelRef.current = null;
    }
    setMicLevel(0);
    setIsRecording(false);

    const base64 = await audioService.stopRecording();
    if (!base64) return;

    // Send full recording as single chunk + end signal
    send({ type: 'audio_chunk', data: base64 });
    send({ type: 'audio_end' });
  }, [isRecording, send]);

  return { isRecording, startRecording, stopRecording, micLevel, isInitialized };
}
