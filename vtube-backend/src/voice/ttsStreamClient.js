/**
 * ttsStreamClient.js — WebSocket client for Dev C's TTS backend
 *
 * Streams LLM sentence tokens to Dev C's TTS service.
 * Dev C handles: sentence chunking, ElevenLabs synthesis, audio queue, rate limiting.
 *
 * Protocol (send):
 *   { type: "llm_tokens", data: { tokens: ["Hello!"], flush: false } }  ← per sentence
 *   { type: "llm_tokens", data: { tokens: [],         flush: true  } }  ← end of response
 *   { type: "interrupt",  data: {} }                                     ← barge-in
 *
 * Protocol (receive):
 *   { type: "audio_chunk", data: "<base64 MP3>" }
 *   { type: "audio_end" }
 */

import { WebSocket } from 'ws';

const TTS_BACKEND_URL = process.env.TTS_BACKEND_URL
  || 'wss://oshi-ai-vtuber-backend.onrender.com/api/tts/stream';

export class TTSStreamClient {
  constructor({ onAudioChunk, onAudioEnd, onError }) {
    this.onAudioChunk = onAudioChunk;
    this.onAudioEnd = onAudioEnd ?? (() => {});
    this.onError = onError ?? ((e) => console.error('[TTS] Error:', e.message));
    this.ws = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(TTS_BACKEND_URL);

      this.ws.on('open', () => {
        this.connected = true;
        console.log('[TTS] Connected to Dev C backend:', TTS_BACKEND_URL);
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'audio_chunk' && msg.data) {
            this.onAudioChunk(msg.data);
          }
          if (msg.type === 'audio_end') {
            this.onAudioEnd();
          }
        } catch {
          // Binary frame — treat as raw audio chunk
          if (Buffer.isBuffer(data)) {
            this.onAudioChunk(data.toString('base64'));
          }
        }
      });

      this.ws.on('error', (err) => {
        this.connected = false;
        this.onError(err);
        reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        console.log('[TTS] Disconnected from Dev C backend');
      });
    });
  }

  /**
   * sendTokens — sends a sentence to Dev C's TTS backend
   * @param {string[]} tokens  — array of text tokens/sentence
   * @param {boolean}  flush   — true signals end of LLM response
   */
  sendTokens(tokens, flush = false) {
    if (!this._isOpen()) return;
    this.ws.send(JSON.stringify({ type: 'llm_tokens', data: { tokens, flush } }));
  }

  /**
   * interrupt — cancels current TTS playback (barge-in)
   * Call when Deepgram detects user speaking during avatar playback.
   */
  interrupt() {
    if (!this._isOpen()) return;
    console.log('[TTS] Sending interrupt (barge-in)');
    this.ws.send(JSON.stringify({ type: 'interrupt', data: {} }));
  }

  close() {
    this.ws?.close();
    this.connected = false;
  }

  _isOpen() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}
