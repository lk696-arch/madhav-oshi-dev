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
import { sessionOpen, onMessage } from './genki/genkiEngine.js';
import { getBalance, creditCoins, deductCoins, hasProcessedPayment, recordGift } from './shop/shopStore.js';
import { getGift, GIFT_CATALOGUE } from './shop/giftCatalogue.js';
import { COIN_BUNDLES, getBundleByPriceId } from './shop/coinBundles.js';
import Stripe from 'stripe';

const app = express();

// ── Stripe webhook MUST be registered before express.json() ──────────────────
// express.raw() captures the raw body Stripe needs to verify signatures.
// If express.json() runs first, req.body is already parsed and constructEvent() throws.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

app.post('/api/coins/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, coins } = session.metadata;
    const paymentId = session.payment_intent;

    // Idempotency — never double-credit
    if (hasProcessedPayment(paymentId)) {
      console.log(`[Stripe] Duplicate webhook ignored: ${paymentId}`);
      return res.json({ received: true });
    }

    const newBalance = creditCoins(userId, parseInt(coins), paymentId);
    console.log(`[Shop] Credited ${coins} Hoshi Coins to ${userId} — new balance: ${newBalance}`);
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST'],
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/session-open', (req, res) => {
  const { userId } = req.body;
  if (!userId?.trim()) return res.status(400).json({ error: 'userId is required' });
  const result = sessionOpen(userId.trim());
  res.json(result);
});

app.post('/api/chat', async (req, res) => {
  const { text, message, prompt, messages, sessionId, userId, sessionMsgCount } = req.body;
  const userText = (text || message || prompt || messages?.[messages.length - 1]?.content)?.trim();
  if (!userText) return res.status(400).json({ error: 'text is required' });

  const agent = new VTuberAgent(sessionId || 'rest-session');

  const inputCheck = await agent.checkInput(userText);
  if (!inputCheck.safe) return res.status(400).json({ error: inputCheck.reason });

  const noopTTS = { sendTokens: () => {}, interrupt: () => {} };
  const llmResult = await agent.thinkAndSpeak(userText, noopTTS, null);

  const outputCheck = await agent.checkOutput(llmResult.response);
  if (!outputCheck.safe) return res.status(400).json({ error: 'Response blocked by safety filter' });

  agent.saveMemory(userText, llmResult);

  // Genki: +2 per message (capped at +10/session)
  if (userId) onMessage(userId, sessionMsgCount ?? 0);

  res.json({
    text: llmResult.response,
    emotion: llmResult.emotion,
    intensity: llmResult.intensity,
  });
});

// GET /api/shop/catalogue — all active gift items
app.get('/api/shop/catalogue', (_req, res) => {
  res.json({ gifts: GIFT_CATALOGUE, bundles: COIN_BUNDLES });
});

// GET /api/shop/balance/:userId — current Hoshi Coin balance
app.get('/api/shop/balance/:userId', (req, res) => {
  const balance = getBalance(req.params.userId);
  res.json({ userId: req.params.userId, hoshi_balance: balance });
});

// POST /api/coins/checkout — create Stripe Checkout Session
app.post('/api/coins/checkout', async (req, res) => {
  const { userId, bundleId, successUrl, cancelUrl } = req.body;
  if (!userId?.trim()) return res.status(400).json({ error: 'userId is required' });
  if (!bundleId) return res.status(400).json({ error: 'bundleId is required' });

  const bundle = COIN_BUNDLES.find(b => b.id === bundleId);
  if (!bundle) return res.status(404).json({ error: 'Bundle not found' });
  if (!bundle.price_id) return res.status(503).json({ error: 'Bundle not yet available — Stripe price ID pending' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe not configured — add STRIPE_SECRET_KEY to env' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: bundle.price_id, quantity: 1 }],
    metadata: { userId: userId.trim(), bundleId: bundle.id, coins: bundle.coins },
    success_url: successUrl || `${process.env.APP_URL || 'https://oshiweb.vercel.app'}/shop?payment=success`,
    cancel_url:  cancelUrl  || `${process.env.APP_URL || 'https://oshiweb.vercel.app'}/shop?payment=cancelled`,
  });

  res.json({ checkout_url: session.url, session_id: session.id });
});

// POST /api/gifts/send — spend coins, apply genki boost, record gift
app.post('/api/gifts/send', async (req, res) => {
  const { userId, giftId } = req.body;
  if (!userId?.trim()) return res.status(400).json({ error: 'userId is required' });
  if (!giftId) return res.status(400).json({ error: 'giftId is required' });

  const gift = getGift(giftId);
  if (!gift) return res.status(404).json({ error: 'Gift not found' });

  const deducted = deductCoins(userId.trim(), gift.coin_cost, giftId);
  if (!deducted) {
    return res.status(402).json({
      error: 'Insufficient Hoshi Coins',
      required: gift.coin_cost,
      balance: getBalance(userId.trim()),
    });
  }

  recordGift(userId.trim(), giftId, gift.duration_days);

  // Apply genki boost if applicable
  if (gift.genki_boost > 0) {
    try {
      const { applyBoost } = await import('./genki/genkiEngine.js');
      applyBoost(userId.trim(), gift.genki_boost);
    } catch (_) { /* genki engine is optional */ }
  }

  res.json({
    success: true,
    gift: { id: gift.id, name: gift.name, name_jp: gift.name_jp, category: gift.category },
    genki_boost: gift.genki_boost,
    new_balance: getBalance(userId.trim()),
  });
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

  agent.saveMemory(userText, llmResult);
}

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`[Server] AI VTuber backend running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[Server] Health check:       http://localhost:${PORT}/health`);
});
