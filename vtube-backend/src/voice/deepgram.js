/**
 * deepgram.js — Deepgram Nova-3 streaming Speech-to-Text
 *
 * Architecture:
 *   One DeepgramSTT instance is created per WebSocket session.
 *   The frontend sends raw base64 audio chunks (WebM/Opus from MediaRecorder)
 *   which are decoded and forwarded to Deepgram in real time.
 *
 * Deepgram streaming protocol:
 *   - Connect to wss://api.deepgram.com/v1/listen with query params
 *   - Auth via Authorization header: "Token <key>"
 *   - Send binary audio frames as they arrive (no need to buffer)
 *   - Receive JSON events:
 *       { type: "Results", is_final: bool, speech_final: bool,
 *         channel: { alternatives: [{ transcript: string }] } }
 *       { type: "UtteranceEnd" }  ← fires after endpointing silence window
 *
 * Latency profile:
 *   Deepgram Nova-3 streaming: ~150–300ms from speech end to speech_final event
 *   This is ~100–200ms faster than ElevenLabs Scribe for streaming workloads.
 *
 * Turn detection:
 *   speech_final=true fires when Deepgram detects endpointing (600ms silence).
 *   The transcript in that event is the complete utterance — send to LLM.
 *
 * KeepAlive:
 *   Deepgram closes idle connections after 10s. Call keepAlive() periodically
 *   (every 5s) when no audio is being sent, e.g. during avatar response playback.
 */

import { WebSocket } from 'ws';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

export class DeepgramSTT {
  /**
   * @param {object} callbacks
   * @param {(text: string) => void} callbacks.onInterim   — partial transcript (live display)
   * @param {(text: string) => void} callbacks.onFinal     — complete utterance (triggers LLM)
   * @param {(err: Error) => void}   [callbacks.onError]   — connection error
   */
  constructor({ onInterim, onFinal, onError }) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onError = onError ?? ((err) => console.error('[Deepgram] Error:', err.message));
    this.ws = null;
    this.connected = false;
    // Buffer for audio received before the connection is open
    this._preConnectBuffer = [];
    // Accumulate is_final transcripts until speech_final
    this._utteranceBuffer = '';
  }

  /**
   * connect — opens the Deepgram WebSocket and resolves when ready to receive audio
   * @returns {Promise<void>}
   */
  connect() {
    if (!DEEPGRAM_API_KEY) {
      return Promise.reject(new Error('DEEPGRAM_API_KEY not set'));
    }

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'en-US',
        // Browser MediaRecorder outputs WebM container with Opus codec
        encoding: 'opus',
        container: 'webm',
        interim_results: 'true',
        // 600ms silence = end of utterance (aligns with brief spec)
        endpointing: '600',
        // utterance_end_ms fires a UtteranceEnd event after this silence
        utterance_end_ms: '1000',
        smart_format: 'true',
        // Reduce false positives on short words
        no_delay: 'true',
      });

      this.ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, {
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
        },
      });

      this.ws.on('open', () => {
        this.connected = true;
        console.log('[Deepgram] WebSocket connected');
        // Flush any audio that arrived before the connection opened
        for (const chunk of this._preConnectBuffer) {
          this.ws.send(chunk);
        }
        this._preConnectBuffer = [];
        resolve();
      });

      this.ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return; // Deepgram only sends JSON
        }

        if (msg.type === 'Results') {
          const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
          if (!transcript) return;

          if (msg.is_final) {
            // Accumulate final words into the current utterance
            this._utteranceBuffer += (this._utteranceBuffer ? ' ' : '') + transcript;

            if (msg.speech_final) {
              // Endpointing triggered — user finished speaking
              const utterance = this._utteranceBuffer.trim();
              this._utteranceBuffer = '';
              if (utterance) {
                console.log(`[Deepgram] speech_final: "${utterance}"`);
                this.onFinal(utterance);
              }
            }
          } else {
            // Interim result — show live in UI but don't trigger LLM
            this.onInterim(transcript);
          }
        }

        if (msg.type === 'UtteranceEnd') {
          // Fires after utterance_end_ms silence — use as fallback trigger
          const utterance = this._utteranceBuffer.trim();
          if (utterance) {
            this._utteranceBuffer = '';
            console.log(`[Deepgram] UtteranceEnd fallback: "${utterance}"`);
            this.onFinal(utterance);
          }
        }

        if (msg.type === 'Error') {
          this.onError(new Error(`Deepgram error: ${msg.message}`));
        }
      });

      this.ws.on('error', (err) => {
        this.connected = false;
        this.onError(err);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        console.log(`[Deepgram] WebSocket closed (${code}: ${reason})`);
      });
    });
  }

  /**
   * sendAudio — forwards a base64-encoded audio chunk to Deepgram
   * @param {string} base64Chunk — from client audio_chunk message
   */
  sendAudio(base64Chunk) {
    const buffer = Buffer.from(base64Chunk, 'base64');
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    } else {
      // Buffer pre-connection audio (e.g. user speaks before WS opens)
      this._preConnectBuffer.push(buffer);
    }
  }

  /**
   * flush — called when client sends audio_end (manual turn end).
   * If we have accumulated transcript not yet triggered by speech_final, fire it now.
   * Then close the Deepgram stream gracefully.
   */
  flush() {
    const utterance = this._utteranceBuffer.trim();
    this._utteranceBuffer = '';

    if (utterance) {
      console.log(`[Deepgram] Manual flush: "${utterance}"`);
      this.onFinal(utterance);
    }

    this.close();
  }

  /**
   * keepAlive — prevents Deepgram from closing an idle connection.
   * Call every ~5 seconds while avatar is speaking (no mic audio being sent).
   */
  keepAlive() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }

  /**
   * close — gracefully closes the Deepgram WebSocket
   */
  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send CloseStream signal so Deepgram finalizes any pending transcript
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close();
    }
    this.connected = false;
    this._preConnectBuffer = [];
  }
}
