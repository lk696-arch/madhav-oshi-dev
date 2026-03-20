/**
 * server.js — AI VTuber Backend Entry Point
 *
 * Per-session data flow:
 *   1. Client sends audio_chunk (base64 WebM/Opus) while speaking
 *   2. Server forwards to Deepgram Nova-3 streaming STT
 *   3. Deepgram speech_final → triggers LLM pipeline
 *   4. Claude streams tokens → sentence chunks → Dev C TTS backend (wss)
 *   5. Dev C streams audio back → forwarded to frontend
 *   6. Barge-in: user speaks during playback → interrupt sent to Dev C
 *
 * WebSocket message protocol:
 *   Client → Server:
 *     { type: "audio_chunk", data: "<base64 WebM/Opus>" }
 *     { type: "audio_end" }
 *     { type: "text_input", text: "..." }
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "transcript",   text: "...", final: false|true }
 *     { type: "llm_token",    text: "..." }
 *     { type: "llm_response", text: "...", emotion: "happy", intensity: 0.8 }
 *     { type: "expression",   params: { ... } }
 *     { type: "audio_chunk",  data: "<base64 MP3>" }
 *     { type: "audio_end" }
 *     { type: "error",        message: "...", code: "..." }
 *     { type: "pong" }
 */

import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { VTuberAgent } from './agents/vtuberAgent.js';
import { DeepgramSTT } from './voice/deepgram.js';
import { TTSStreamClient } from './voice/ttsStreamClient.js';

const app = express();
app.use(express.json());
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5500').split(','),
  methods: ['GET', 'POST'],
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  const agent = new VTuberAgent(sessionId);

  let pipelineRunning = false;
  let avatarSpeaking = false;    // true while Dev C is streaming audio back
  let keepAliveInterval = null;

  console.log(`[WS] Session connected: ${sessionId}  (${wss.clients.size} active)`);

  // ── Dev C TTS client ────────────────────────────────────────────────────────
  const ttsClient = new TTSStreamClient({
    onAudioChunk: (chunk) => {
      avatarSpeaking = true;
      send({ type: 'audio_chunk', data: chunk });
    },
    onAudioEnd: () => {
      avatarSpeaking = false;
      send({ type: 'audio_end' });
      stopKeepAlive();
    },
    onError: (err) => {
      console.error(`[Session ${sessionId}] TTS error:`, err.message);
    },
  });

  ttsClient.connect().catch((err) => {
    console.warn(`[Session ${sessionId}] TTS connect failed:`, err.message);
  });

  // ── Deepgram STT ────────────────────────────────────────────────────────────
  const stt = new DeepgramSTT({
    onInterim: (text) => send({ type: 'transcript', text, final: false }),
    onFinal: (transcript) => {
      send({ type: 'transcript', text: transcript, final: true });
      triggerPipeline(transcript);
    },
    onError: (err) => {
      console.error(`[Session ${sessionId}] Deepgram error:`, err.message);
    },
  });

  stt.connect().catch((err) => {
    console.warn(`[Session ${sessionId}] Deepgram connect failed (STT disabled):`, err.message);
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function send(payload) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function startKeepAlive() {
    stopKeepAlive();
    keepAliveInterval = setInterval(() => stt.keepAlive(), 5000);
  }

  function stopKeepAlive() {
    if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
  }

  function triggerPipeline(transcript) {
    if (pipelineRunning) {
      console.log(`[Session ${sessionId}] Pipeline busy, dropping: "${transcript.slice(0, 40)}"`);
      return;
    }
    pipelineRunning = true;
    startKeepAlive();

    runPipeline(agent, transcript, ttsClient, send)
      .catch((err) => {
        console.error(`[Session ${sessionId}] Pipeline error:`, err.message);
        send({ type: 'error', message: err.message, code: err.code || 'PIPELINE_ERROR' });
      })
      .finally(() => {
        pipelineRunning = false;
        // Note: stopKeepAlive() is called in ttsClient.onAudioEnd, not here,
        // so Deepgram stays alive until Dev C finishes sending audio.
      });
  }

  // ── Message handler ─────────────────────────────────────────────────────────

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return send({ type: 'error', message: 'Invalid JSON', code: 'PARSE_ERROR' }); }

    switch (msg.type) {

      case 'audio_chunk':
        if (msg.data) {
          // Barge-in: user speaks while avatar is playing → interrupt Dev C
          if (avatarSpeaking) {
            console.log(`[Session ${sessionId}] Barge-in detected — interrupting TTS`);
            ttsClient.interrupt();
            avatarSpeaking = false;
            send({ type: 'audio_end' }); // tell frontend to stop playback immediately
            stopKeepAlive();
          }
          stt.sendAudio(msg.data);
        }
        break;

      case 'audio_end':
        stt.flush();
        break;

      case 'text_input': {
        const text = msg.text?.trim();
        if (!text) break;
        send({ type: 'transcript', text, final: true });
        triggerPipeline(text);
        break;
      }

      case 'ping':
        send({ type: 'pong' });
        break;

      default:
        send({ type: 'error', message: `Unknown message type: ${msg.type}`, code: 'UNKNOWN_TYPE' });
    }
  });

  ws.on('close', () => {
    stopKeepAlive();
    stt.close();
    ttsClient.close();
    agent.cleanup();
    console.log(`[WS] Session closed: ${sessionId}  (${wss.clients.size} active)`);
  });

  ws.on('error', (err) => console.error(`[WS] Session ${sessionId} error:`, err.message));

  send({ type: 'connected', sessionId });
});

/**
 * runPipeline — per-turn:
 *   1. Safety check input
 *   2. Stream Claude → send sentence tokens to Dev C TTS
 *   3. Safety check output
 *   4. Send llm_response + expression to frontend
 *   5. Save to memory
 *
 * Audio flow is handled by ttsClient callbacks (onAudioChunk / onAudioEnd),
 * not here — so this resolves as soon as LLM is done, not when audio ends.
 */
async function runPipeline(agent, userText, ttsClient, send) {
  const inputCheck = await agent.checkInput(userText);
  if (!inputCheck.safe) {
    const err = new Error(inputCheck.reason);
    err.code = 'SAFETY_BLOCK';
    throw err;
  }

  const llmResult = await agent.thinkAndSpeak(
    userText,
    ttsClient,
    (firstSentence) => send({ type: 'llm_token', text: firstSentence }),
  );

  const outputCheck = await agent.checkOutput(llmResult.response);
  if (!outputCheck.safe) {
    const err = new Error('Response blocked by safety filter');
    err.code = 'SAFETY_BLOCK';
    throw err;
  }

  send({
    type: 'llm_response',
    text: llmResult.response,
    emotion: llmResult.emotion,
    intensity: llmResult.intensity,
  });
  send({
    type: 'expression',
    params: agent.emotionToParams(llmResult.emotion, llmResult.intensity),
  });

  agent.saveMemory(userText, llmResult.response);
}

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`[Server] AI VTuber backend running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[Server] Health check:       http://localhost:${PORT}/health`);
});
