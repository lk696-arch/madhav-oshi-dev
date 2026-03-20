/**
 * app.js — Frontend orchestrator
 *
 * Owns:
 *   - WebSocket connection lifecycle
 *   - UI state machine (connecting → idle → recording → thinking → speaking)
 *   - Message routing: WS events → VoiceManager / EmotionController / UI
 *   - User input handling (mic push-to-talk + text fallback)
 *
 * State machine:
 *   connecting → idle           (WebSocket opens)
 *   idle → recording            (mic button held)
 *   recording → thinking        (mic released + audio sent)
 *   thinking → speaking         (LLM response received)
 *   speaking → idle             (TTS audio_end received)
 *   any → error                 (server error message)
 */

import { VoiceManager } from './voiceManager.js';
import { EmotionController } from './emotionController.js';
import { Live2DManager } from './live2dManager.js';

// ── Config ───────────────────────────────────────────────────────────────────
// WS_BACKEND_URL is set in js/config.js — edit that file after Railway deploy
const WS_URL = window.WS_BACKEND_URL || 'ws://localhost:3001/ws';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const connectionStatus = $('connection-status');
const statusText = $('status-text');
const sessionIdEl = $('session-id');
const micBtn = $('mic-btn');
const micLabel = $('mic-label');
const audioViz = $('audio-viz');
const textInput = $('text-input');
const sendBtn = $('send-btn');
const transcriptLog = $('transcript-log');
const responseText = $('response-text');
const thinkingIndicator = $('thinking-indicator');
const emotionLabel = $('emotion-label');
const emotionFill = $('emotion-fill');

// ── State ─────────────────────────────────────────────────────────────────────
let ws = null;
let state = 'connecting';   // connecting | idle | recording | thinking | speaking

// ── Managers ─────────────────────────────────────────────────────────────────
const live2d = new Live2DManager('live2d-canvas');
let voice = null;
let emotions = null;
let vizRafId = null;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Initialize Live2D (demo or real)
  const model = await live2d.init();

  // Initialize emotion controller with the model (null = demo mode)
  emotions = new EmotionController(model);
  emotions.startLoop();

  // Initialize voice manager (mic setup deferred until first button press)
  voice = new VoiceManager((base64chunk) => {
    wsSend({ type: 'audio_chunk', data: base64chunk });
  });

  // Connect WebSocket
  connectWS();

  // Wire up UI
  setupMicButton();
  setupTextInput();

  // Start visualizer loop
  startVizLoop();
}

// ── WebSocket ──────────────────────────────────────────────────────────────────

function connectWS() {
  setStatus('connecting', 'Connecting...');

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus('connecting', 'Waiting for session...');
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); }
    catch { return; }

    handleServerMessage(msg);
  };

  ws.onclose = () => {
    setStatus('disconnected', 'Disconnected — reload to reconnect');
    setState('connecting');
    disableControls(true);
    // Attempt reconnect after 3s
    setTimeout(connectWS, 3000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
    setStatus('error', 'Connection error');
  };
}

function wsSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// ── Message routing ────────────────────────────────────────────────────────────

function handleServerMessage(msg) {
  switch (msg.type) {

    case 'connected':
      sessionIdEl.textContent = `session: ${msg.sessionId.slice(0, 8)}`;
      setStatus('connected', 'Connected — ready');
      setState('idle');
      disableControls(false);
      break;

    case 'transcript':
      // Show user's transcribed speech in the log
      appendTurn('user', msg.text);
      setState('thinking');
      showThinking(true);
      break;

    case 'llm_response':
      // Show Oshi's response + update emotion badge
      showThinking(false);
      appendTurn('oshi', msg.text);
      responseText.textContent = msg.text;
      updateEmotionBadge(msg.emotion, msg.intensity);
      setState('speaking');
      break;

    case 'expression':
      // Drive avatar expression
      if (emotions) emotions.applyEmotion(msg.params);
      break;

    case 'audio_chunk':
      // Queue audio chunk for playback
      if (voice) voice.playAudioChunk(msg.data);
      break;

    case 'audio_end':
      // TTS stream complete — return to idle
      if (voice) voice.onAudioEnd();
      setState('idle');
      break;

    case 'error':
      showThinking(false);
      setState('idle');
      console.error('[Server Error]', msg.code, msg.message);
      if (msg.code === 'SAFETY_BLOCK') {
        appendTurn('oshi', 'Hmm, I can\'t respond to that one. Ask me something else!');
      } else {
        appendTurn('oshi', `[Error: ${msg.message}]`);
      }
      break;

    case 'pong':
      break;
  }
}

// ── Mic button (push-to-talk) ──────────────────────────────────────────────────

function setupMicButton() {
  let micInitialized = false;

  async function startTalk() {
    if (state !== 'idle') return;

    // First press: initialize mic (requires user gesture)
    if (!micInitialized) {
      try {
        await voice.init();
        micInitialized = true;
      } catch (err) {
        appendTurn('oshi', 'I can\'t hear you — microphone access was denied.');
        return;
      }
    }

    voice.startRecording();
    setState('recording');
  }

  function stopTalk() {
    if (state !== 'recording') return;
    voice.stopRecording(() => {
      wsSend({ type: 'audio_end' });
    });
    setState('thinking');
    showThinking(true);
  }

  // Mouse events
  micBtn.addEventListener('mousedown', startTalk);
  micBtn.addEventListener('mouseup', stopTalk);
  micBtn.addEventListener('mouseleave', () => { if (state === 'recording') stopTalk(); });

  // Touch events (mobile)
  micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startTalk(); });
  micBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopTalk(); });

  // Keyboard shortcut: Space
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body && state === 'idle') {
      e.preventDefault();
      startTalk();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && state === 'recording') {
      e.preventDefault();
      stopTalk();
    }
  });
}

// ── Text input ─────────────────────────────────────────────────────────────────

function setupTextInput() {
  function sendText() {
    const text = textInput.value.trim();
    if (!text || state !== 'idle') return;
    textInput.value = '';
    wsSend({ type: 'text_input', text });
    appendTurn('user', text);
    setState('thinking');
    showThinking(true);
  }

  sendBtn.addEventListener('click', sendText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setState(newState) {
  state = newState;

  const isIdle = newState === 'idle';
  const isRecording = newState === 'recording';

  micBtn.disabled = newState === 'connecting' || newState === 'thinking' || newState === 'speaking';
  textInput.disabled = !isIdle;
  sendBtn.disabled = !isIdle;

  micBtn.classList.toggle('mic-recording', isRecording);
  micLabel.textContent = isRecording ? 'Release to Send' : 'Hold to Talk';
  audioViz.classList.toggle('active', isRecording);
}

function setStatus(type, text) {
  connectionStatus.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function disableControls(disabled) {
  micBtn.disabled = disabled;
  textInput.disabled = disabled;
  sendBtn.disabled = disabled;
}

function showThinking(show) {
  thinkingIndicator.hidden = !show;
  if (show) responseText.textContent = '';
}

function appendTurn(role, text) {
  const turn = document.createElement('div');
  turn.className = `turn ${role}`;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = role === 'user' ? 'You' : 'Oshi';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  turn.appendChild(label);
  turn.appendChild(bubble);
  transcriptLog.appendChild(turn);

  // Auto-scroll to latest
  transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

function updateEmotionBadge(emotion, intensity) {
  emotionLabel.textContent = emotion;
  emotionFill.style.width = `${Math.round(intensity * 100)}%`;
}

// ── Audio visualizer loop ──────────────────────────────────────────────────────

function startVizLoop() {
  const bars = audioViz.querySelectorAll('span');

  function tick() {
    if (voice && state === 'recording') {
      const vol = voice.getVolume();
      bars.forEach((bar, i) => {
        // Stagger each bar height slightly for visual interest
        const offset = Math.sin(Date.now() / 120 + i) * 0.3;
        const h = Math.max(4, Math.round((vol + offset) * 24));
        bar.style.height = `${h}px`;
      });
    }
    vizRafId = requestAnimationFrame(tick);
  }

  vizRafId = requestAnimationFrame(tick);
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
