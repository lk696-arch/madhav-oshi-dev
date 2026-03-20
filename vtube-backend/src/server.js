/**
 * server.js — AI VTuber Backend Entry Point
 *
 * Architecture:
 *   HTTP (Express) ─── health check + REST endpoints
 *   WebSocket (ws)  ─── full-duplex audio/event bus per fan session
 *
 * Per-session data flow:
 *   1. Client sends audio_chunk (base64 WebM/Opus) continuously while speaking
 *   2. Server forwards chunks to Deepgram Nova-3 streaming WebSocket in real time
 *   3. Deepgram emits interim transcripts (shown in UI) and speech_final (triggers LLM)
 *   4. LLM streams tokens → sentence-chunking → ElevenLabs TTS per sentence
 *   5. TTS audio chunks stream back to client as they arrive
 *
 * WebSocket message protocol (all JSON unless noted):
 *   Client → Server:
 *     { type: "audio_chunk",   data: "<base64 WebM/Opus>" }  ← mic audio, sent continuously
 *     { type: "audio_end" }                                   ← manual end-of-utterance signal
 *     { type: "text_input",    text: "..." }                  ← text-mode fallback
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "transcript",    text: "...", final: false }    ← Deepgram interim (live display)
 *     { type: "transcript",    text: "...", final: true }     ← Deepgram speech_final
 *     { type: "llm_token",     text: "..." }                  ← first sentence from LLM (early display)
 *     { type: "llm_response",  text: "...", emotion: "happy", intensity: 0.8 }  ← full response
 *     { type: "expression",    params: { ParamEyeSmile: 1.0, ... } }
 *     { type: "audio_chunk",   data: "<base64 MP3>" }
 *     { type: "audio_end" }
 *     { type: "error",         message: "...", code: "SAFETY_BLOCK" }
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

// ─── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5500').split(','),
  methods: ['GET', 'POST'],
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── HTTP server (shared with WebSocket) ───────────────────────────────────────
const server = createServer(app);

// ─── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  const agent = new VTuberAgent(sessionId);

  // Pipeline mutex — prevents concurrent pipeline runs per session
  let pipelineRunning = false;

  // KeepAlive interval — prevents Deepgram from closing idle connections
  // while the avatar is speaking (no mic audio flowing)
  let keepAliveInterval = null;

  console.log(`[WS] Session connected: ${sessionId}  (${wss.clients.size} active)`);

  // ── Deepgram STT setup ────────────────────────────────────────────────────────
  const stt = new DeepgramSTT({
    onInterim: (text) => {
      send({ type: 'transcript', text, final: false });
    },
    onFinal: (transcript) => {
      send({ type: 'transcript', text: transcript, final: true });
      // speech_final fires when Deepgram detects 600ms silence — trigger pipeline
      triggerPipeline(transcript);
    },
    onError: (err) => {
      console.error(`[Session ${sessionId}] Deepgram error:`, err.message);
      // Non-fatal: fall back gracefully (text_input still works)
    },
  });

  // Connect Deepgram immediately so it's ready when the user speaks
  stt.connect().catch((err) => {
    console.warn(`[Session ${sessionId}] Deepgram connect failed (STT disabled):`, err.message);
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function send(payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function startKeepAlive() {
    stopKeepAlive();
    keepAliveInterval = setInterval(() => stt.keepAlive(), 5000);
  }

  function stopKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }

  function triggerPipeline(transcript) {
    if (pipelineRunning) {
      console.log(`[Session ${sessionId}] Pipeline busy, dropping: "${transcript.slice(0, 40)}"`);
      return;
    }
    pipelineRunning = true;
    startKeepAlive(); // keep Deepgram alive while avatar speaks

    runPipeline(agent, transcript, send)
      .catch((err) => {
        console.error(`[Session ${sessionId}] Pipeline error:`, err.message);
        send({ type: 'error', message: err.message, code: err.code || 'PIPELINE_ERROR' });
      })
      .finally(() => {
        pipelineRunning = false;
        stopKeepAlive();
      });
  }

  // ── Message handler ───────────────────────────────────────────────────────────

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send({ type: 'error', message: 'Invalid JSON', code: 'PARSE_ERROR' });
    }

    switch (msg.type) {

      // ── Mic audio — forward to Deepgram in real time ──────────────────────────
      case 'audio_chunk':
        if (msg.data) stt.sendAudio(msg.data);
        break;

      // ── Manual end-of-utterance — flush Deepgram + trigger pipeline ───────────
      case 'audio_end':
        stt.flush(); // fires onFinal if there's a buffered transcript
        break;

      // ── Text input mode (no mic / testing) ───────────────────────────────────
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
    agent.cleanup();
    console.log(`[WS] Session closed: ${sessionId}  (${wss.clients.size} active)`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Session ${sessionId} error:`, err.message);
  });

  send({ type: 'connected', sessionId });
});

/**
 * runPipeline — streaming per-turn flow:
 *   text → safety → LLM streaming + sentence-chunked TTS → emotion → memory
 *
 * The key difference from v1:
 *   - thinkAndSpeak() overlaps LLM generation and TTS synthesis
 *   - Audio starts playing after the FIRST sentence (~700ms), not the full response (~1.2s)
 *   - Expression update is sent once after the full LLM response completes
 */
async function runPipeline(agent, userText, send) {
  // 1. Safety filter on input
  const inputCheck = await agent.checkInput(userText);
  if (!inputCheck.safe) {
    const err = new Error(inputCheck.reason);
    err.code = 'SAFETY_BLOCK';
    throw err;
  }

  // 2. Stream LLM + TTS in pipeline (sentence-chunked)
  //    Audio chunks are sent to client as they arrive from ElevenLabs
  const llmResult = await agent.thinkAndSpeak(
    userText,
    (audioChunk) => send({ type: 'audio_chunk', data: audioChunk }),
    (firstSentence) => send({ type: 'llm_token', text: firstSentence }),
  );

  // Signal end of audio stream
  send({ type: 'audio_end' });

  // 3. Safety filter on completed LLM output
  const outputCheck = await agent.checkOutput(llmResult.response);
  if (!outputCheck.safe) {
    const err = new Error('Response blocked by safety filter');
    err.code = 'SAFETY_BLOCK';
    throw err;
  }

  // 4. Send full LLM response text + emotion expression update
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

  // 5. Persist turn to session memory
  agent.saveMemory(userText, llmResult.response);
}

// ─── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`[Server] AI VTuber backend running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[Server] Health check:       http://localhost:${PORT}/health`);
});
