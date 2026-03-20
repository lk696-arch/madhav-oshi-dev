/**
 * voiceManager.js — Microphone capture + audio playback
 *
 * Capture pipeline:
 *   Browser mic → MediaRecorder (WebM/Opus, 16kHz preferred)
 *   → ondataavailable chunks → base64 encode
 *   → WebSocket { type: "audio_chunk", data: base64 }
 *   → On stop: { type: "audio_end" }
 *
 * Playback pipeline:
 *   WebSocket { type: "audio_chunk", data: base64 MP3 }
 *   → decode base64 → ArrayBuffer
 *   → AudioContext.decodeAudioData → AudioBuffer
 *   → AudioBufferSourceNode → playback queue
 *
 * Note on latency:
 *   We start playing the first audio chunk as soon as it arrives from the server.
 *   Chunks are queued using the AudioContext clock so they play seamlessly back-to-back.
 *   This achieves ~200–400ms audio-start latency after TTS begins streaming.
 */

export class VoiceManager {
  constructor(onAudioChunk) {
    this.onAudioChunk = onAudioChunk;  // callback: (base64chunk) => void (sends to WS)
    this.mediaRecorder = null;
    this.audioCtx = null;
    this.nextPlayTime = 0;             // AudioContext clock for seamless chunk queueing
    this.isRecording = false;
    this.stream = null;
    this.analyser = null;             // for audio visualizer
    this.vizCallback = null;          // called each frame with volume 0-1
  }

  /**
   * init — requests mic permission and sets up MediaRecorder
   * Call once on user gesture (button click) to satisfy browser autoplay policy.
   */
  async init() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,    // 16kHz preferred by ElevenLabs STT
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Set up audio context for both visualizer and playback
      this.audioCtx = new AudioContext();

      // Analyser for visualizer bars
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      return true;
    } catch (err) {
      console.error('[VoiceManager] Mic init failed:', err.message);
      throw new Error(`Microphone access denied: ${err.message}`);
    }
  }

  /**
   * startRecording — begins capturing mic audio and streaming chunks to server
   */
  startRecording() {
    if (this.isRecording || !this.stream) return;

    // Pick the best supported MIME type
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ].find(m => MediaRecorder.isTypeSupported(m)) ?? '';

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 128_000,
    });

    this.mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size === 0) return;
      const base64 = await blobToBase64(e.data);
      this.onAudioChunk(base64);
    };

    // Emit chunks every 250ms for low-latency streaming
    this.mediaRecorder.start(250);
    this.isRecording = true;
  }

  /**
   * stopRecording — stops capture and signals end-of-utterance to server
   * @param {() => void} onStopped  — called after recorder flushes final chunk
   */
  stopRecording(onStopped) {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
      onStopped?.();
    };
    this.mediaRecorder.stop();
  }

  /**
   * playAudioChunk — decodes and queues a base64 MP3 chunk from the server
   *
   * Chunks are scheduled using the AudioContext clock so they play back-to-back
   * without gaps, even if they arrive with variable network latency.
   *
   * @param {string} base64Mp3
   */
  async playAudioChunk(base64Mp3) {
    if (!this.audioCtx) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const arrayBuffer = base64ToArrayBuffer(base64Mp3);

    let audioBuffer;
    try {
      audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('[VoiceManager] Failed to decode audio chunk:', err.message);
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    // Schedule to play after current queue ends
    const startAt = Math.max(this.audioCtx.currentTime, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + audioBuffer.duration;
  }

  /**
   * onAudioEnd — called when server signals TTS stream is complete
   * Resets the playback clock so next response starts fresh.
   */
  onAudioEnd() {
    // nextPlayTime will naturally expire; nothing to explicitly reset
  }

  /**
   * getVolume — returns current mic volume as 0.0–1.0 (for visualizer)
   */
  getVolume() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    return avg / 255;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:audio/webm;base64,XXXX..." — strip the header
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
