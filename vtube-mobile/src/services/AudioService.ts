/**
 * AudioService.ts — Microphone recording + audio playback
 *
 * Recording strategy:
 *   expo-av records to a temp file → we read it as base64 on stop →
 *   send as single audio_chunk + audio_end to backend.
 *   (React Native doesn't support real-time streaming chunks from MediaRecorder,
 *   so we batch the full recording and send it on release.)
 *
 * Playback strategy:
 *   Incoming base64 MP3 chunks from the server are buffered in memory.
 *   On audio_end, we concatenate and write to a temp file, then play with expo-av.
 *   This buffers ~200–500ms of extra latency vs. web streaming but is
 *   rock-solid reliable on iOS and Android.
 *
 * Week 2 upgrade — true streaming playback:
 *   Use expo-av's progressUpdateIntervalMillis with chunked file writes, or
 *   integrate react-native-track-player for a lower-level queue.
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { RECORDING_OPTIONS } from '../constants/config';

export class AudioService {
  private recording: Audio.Recording | null = null;
  private playbackSound: Audio.Sound | null = null;
  private audioChunks: string[] = [];
  private isInitialized = false;

  // ── Setup ────────────────────────────────────────────────────────────────────

  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    this.isInitialized = true;
    return true;
  }

  // ── Recording ────────────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (!this.isInitialized) throw new Error('AudioService not initialized');
    if (this.recording) await this.stopRecording();

    // Switch to recording mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    this.recording = new Audio.Recording();
    await this.recording.prepareToRecordAsync(RECORDING_OPTIONS as Audio.RecordingOptions);
    await this.recording.startAsync();
  }

  /**
   * stopRecording — stops recording and returns the audio as base64
   */
  async stopRecording(): Promise<string | null> {
    if (!this.recording) return null;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      if (!uri) return null;

      // Read audio file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Clean up temp file
      await FileSystem.deleteAsync(uri, { idempotent: true });

      // Switch back to playback mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      return base64;
    } catch (err) {
      console.error('[AudioService] Stop recording error:', err);
      this.recording = null;
      return null;
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  /**
   * addChunk — buffers a base64 audio chunk from the server
   */
  addChunk(base64: string): void {
    this.audioChunks.push(base64);
  }

  /**
   * playBuffered — concatenates all buffered chunks, writes to temp file, plays
   * Call this when server sends audio_end
   */
  async playBuffered(): Promise<void> {
    if (this.audioChunks.length === 0) return;

    const fullBase64 = this.audioChunks.join('');
    this.audioChunks = [];

    const tempUri = FileSystem.cacheDirectory + `oshi_${Date.now()}.mp3`;

    try {
      // Write base64 audio to temp file
      await FileSystem.writeAsStringAsync(tempUri, fullBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Unload previous sound
      if (this.playbackSound) {
        await this.playbackSound.unloadAsync();
        this.playbackSound = null;
      }

      // Load and play
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri },
        { shouldPlay: true, volume: 1.0 }
      );
      this.playbackSound = sound;

      // Clean up temp file after playback finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          FileSystem.deleteAsync(tempUri, { idempotent: true });
        }
      });
    } catch (err) {
      console.error('[AudioService] Playback error:', err);
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    }
  }

  /**
   * clearChunks — discard any buffered audio (e.g., on safety block)
   */
  clearChunks(): void {
    this.audioChunks = [];
  }

  async stopPlayback(): Promise<void> {
    if (this.playbackSound) {
      await this.playbackSound.stopAsync();
      await this.playbackSound.unloadAsync();
      this.playbackSound = null;
    }
  }

  async cleanup(): Promise<void> {
    await this.stopPlayback();
    if (this.recording) {
      await this.recording.stopAndUnloadAsync().catch(() => {});
      this.recording = null;
    }
    this.audioChunks = [];
  }
}

// Singleton
export const audioService = new AudioService();
