/**
 * elevenlabs.js — ElevenLabs STT + TTS integration
 *
 * STT: ElevenLabs Scribe v2 — sub-150ms, streaming-capable
 *   Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text
 *
 * TTS: ElevenLabs Flash v2.5 — ~75ms model latency
 *   We use the WebSocket streaming endpoint for chunk-by-chunk audio delivery,
 *   which lets the frontend begin playback before the full response is synthesized.
 *   Endpoint: wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input
 *
 * Latency profile (US region, typical):
 *   STT TTFB:  ~150ms
 *   TTS TTFB:  ~200ms (first audio chunk arrives)
 *   Combined:  ~350–600ms before audio starts playing
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import { WebSocket } from 'ws';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// ─── Speech-to-Text ────────────────────────────────────────────────────────────

/**
 * transcribeAudio — converts base64 audio to transcript via ElevenLabs Scribe v2
 *
 * Accepts base64-encoded audio (any format: WebM, WAV, MP3, OGG).
 * Browser MediaRecorder typically outputs WebM/Opus.
 *
 * @param {string} base64Audio
 * @returns {Promise<string>} transcript
 */
export async function transcribeAudio(base64Audio) {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');

  // Decode base64 → Buffer
  const audioBuffer = Buffer.from(base64Audio, 'base64');

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: 'audio/webm',
  });
  form.append('model_id', 'scribe_v2');  // ElevenLabs Scribe v2 — sub-150ms
  form.append('language_code', 'en');    // Force English for lower latency

  const response = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs STT failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return (data.text || '').trim();
}

// ─── Text-to-Speech (streaming) ────────────────────────────────────────────────

/**
 * streamTTS — synthesizes text and streams audio chunks via ElevenLabs WebSocket
 *
 * The ElevenLabs streaming WebSocket protocol:
 *   1. Open connection to wss://api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream-input
 *   2. Send voice settings init message
 *   3. Send text chunk(s) with try_trigger_generation: true
 *   4. Send flush message { text: "" } to finalize
 *   5. Receive binary MP3 audio chunks until connection closes
 *
 * Each chunk is base64-encoded and forwarded to the frontend via onChunk callback.
 *
 * @param {string} text           — plain text to synthesize
 * @param {(chunk: string) => void} onChunk  — called with each base64 MP3 chunk
 * @returns {Promise<void>}        — resolves when TTS stream is complete
 */
export function streamTTS(text, onChunk) {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!VOICE_ID) throw new Error('ELEVENLABS_VOICE_ID not set');

  return new Promise((resolve, reject) => {
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input`
      + `?model_id=${TTS_MODEL}&output_format=mp3_44100_128`;

    const ws = new WebSocket(wsUrl, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    ws.on('open', () => {
      // 1. Send voice settings — optimize for low latency
      ws.send(JSON.stringify({
        text: ' ',  // ElevenLabs requires a space as the first message
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
        generation_config: {
          chunk_length_schedule: [120, 160, 250, 290],  // aggressive chunking for faster first audio
        },
      }));

      // 2. Send the actual text
      ws.send(JSON.stringify({
        text,
        try_trigger_generation: true,
      }));

      // 3. Flush — signals end of input, triggers final generation
      ws.send(JSON.stringify({ text: '' }));
    });

    ws.on('message', (data) => {
      // ElevenLabs sends JSON messages containing base64 audio chunks
      try {
        const msg = JSON.parse(data.toString());
        if (msg.audio) {
          // msg.audio is already base64-encoded MP3
          onChunk(msg.audio);
        }
        if (msg.isFinal) {
          ws.close();
        }
      } catch {
        // Ignore non-JSON messages (shouldn't happen with ElevenLabs)
      }
    });

    ws.on('close', () => resolve());
    ws.on('error', (err) => reject(new Error(`ElevenLabs TTS error: ${err.message}`)));

    // Timeout safety — if stream hangs, reject after 15s
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('ElevenLabs TTS stream timeout'));
    }, 15_000);

    ws.on('close', () => clearTimeout(timeout));
  });
}
