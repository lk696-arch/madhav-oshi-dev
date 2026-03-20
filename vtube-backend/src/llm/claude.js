/**
 * claude.js — LLM integration via Anthropic Claude
 *
 * Two call modes:
 *
 * 1. callClaude() — non-streaming, returns full { response, emotion, intensity }
 *    Use for: simple integrations, testing, fallback
 *
 * 2. streamClaude() — STREAMING with sentence-chunking (use this for production)
 *    - Streams tokens from Claude as they arrive
 *    - Extracts the "response" field from the JSON character-by-character
 *    - Calls onSentence(text) for each complete sentence (≥15 chars)
 *      so TTS can begin IMMEDIATELY without waiting for the full response
 *    - Returns { response, emotion, intensity } once the stream completes
 *
 * Output format:
 *   Claude returns JSON with "response" field FIRST so the streaming parser
 *   hits the spoken text as early as possible:
 *   { "response": string, "emotion": string, "intensity": number }
 *
 * Latency notes:
 *   - Claude Sonnet 4.6 TTFT: ~300–500ms
 *   - First sentence typically arrives ~400–700ms after TTFT
 *   - With streamClaude(), TTS starts at ~700ms instead of ~1200ms (non-streaming)
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 512;

const VALID_EMOTIONS = ['neutral', 'happy', 'excited', 'shy', 'sad', 'surprised', 'focused', 'playful'];

/**
 * JSON format instruction — "response" is listed FIRST so the streaming
 * parser hits the spoken text before emotion/intensity tokens.
 */
const JSON_FORMAT_INSTRUCTION = `
RESPONSE FORMAT — Reply with valid JSON ONLY. No text outside the JSON object. Put "response" first.
{
  "response": "<your spoken reply — plain text, no markdown, no asterisks, 1–3 sentences max>",
  "emotion": "<one of: ${VALID_EMOTIONS.join(', ')}>",
  "intensity": <float 0.0 to 1.0>
}
`.trim();

// ─── Sentence boundary helpers ─────────────────────────────────────────────────

const MIN_SENTENCE_LENGTH = 15;

function isSentenceBoundary(buf) {
  if (buf.length < MIN_SENTENCE_LENGTH) return false;
  return /[.!?]\s$/.test(buf) || /\.\.\.\s*$/.test(buf);
}

// ─── Streaming JSON response-field extractor ───────────────────────────────────

/**
 * ResponseFieldExtractor — state machine that extracts the "response" string value
 * from a JSON token stream, character by character.
 *
 * States:
 *   BEFORE — scanning for '"response": "' marker
 *   INSIDE — collecting characters inside the response string value
 *   DONE   — closing quote found; subsequent tokens are ignored
 *
 * Correctly handles JSON escape sequences (\n, \t, \", \\, etc.)
 */
class ResponseFieldExtractor {
  constructor() {
    this.state = 'BEFORE';
    this._rawBuffer = '';
    this._sentenceBuffer = '';
    this._escaped = false;
  }

  /**
   * process — feed one token chunk; returns array of complete sentences
   * @param {string} chunk
   * @returns {string[]}
   */
  process(chunk) {
    if (this.state === 'BEFORE') {
      this._rawBuffer += chunk;
      const MARKER = '"response": "';
      const idx = this._rawBuffer.indexOf(MARKER);
      if (idx === -1) return [];
      this.state = 'INSIDE';
      const afterMarker = this._rawBuffer.slice(idx + MARKER.length);
      this._rawBuffer = '';
      return afterMarker ? this._processInside(afterMarker) : [];
    }
    if (this.state === 'INSIDE') return this._processInside(chunk);
    return [];
  }

  /**
   * flush — returns any partial sentence remaining after stream ends
   * @returns {string|null}
   */
  flush() {
    const remaining = this._sentenceBuffer.trim();
    this._sentenceBuffer = '';
    return remaining.length > 0 ? remaining : null;
  }

  _processInside(text) {
    const sentences = [];
    const ESC_MAP = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f' };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (this._escaped) {
        this._escaped = false;
        const decoded = ESC_MAP[ch];
        if (decoded !== undefined) this._sentenceBuffer += decoded;
        continue;
      }

      if (ch === '\\') { this._escaped = true; continue; }

      // Closing quote = end of response field value
      if (ch === '"') {
        this.state = 'DONE';
        const remaining = this._sentenceBuffer.trim();
        if (remaining.length > 0) sentences.push(remaining);
        this._sentenceBuffer = '';
        return sentences;
      }

      this._sentenceBuffer += ch;

      if (isSentenceBoundary(this._sentenceBuffer)) {
        sentences.push(this._sentenceBuffer.trim());
        this._sentenceBuffer = '';
      }
    }

    return sentences;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * streamClaude — streaming LLM call with real-time sentence chunking
 *
 * Calls onSentence(text) for each complete sentence as soon as it arrives,
 * enabling TTS to begin before the full LLM response is generated.
 *
 * @param {object}   params
 * @param {string}   params.systemPrompt
 * @param {Array}    params.history          — [{ role, content }, ...]
 * @param {string}   params.userText
 * @param {Function} params.onSentence       — called with each sentence string
 *
 * @returns {Promise<{ response: string, emotion: string, intensity: number }>}
 */
export async function streamClaude({ systemPrompt, history, userText, onSentence }) {
  const fullSystem = `${systemPrompt}\n\n${JSON_FORMAT_INSTRUCTION}`;
  const messages = [
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: userText },
  ];

  const extractor = new ResponseFieldExtractor();
  let fullText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: fullSystem,
    messages,
  });

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue;
    if (event.delta.type !== 'text_delta') continue;

    const chunk = event.delta.text;
    fullText += chunk;

    for (const sentence of extractor.process(chunk)) {
      if (onSentence) onSentence(sentence);
    }
  }

  // Flush any partial sentence that didn't end with punctuation
  const lastSentence = extractor.flush();
  if (lastSentence && onSentence) onSentence(lastSentence);

  return parseLLMResponse(fullText);
}

/**
 * callClaude — non-streaming call (fallback / testing)
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array}  params.history
 * @param {string} params.userText
 *
 * @returns {Promise<{ response: string, emotion: string, intensity: number }>}
 */
export async function callClaude({ systemPrompt, history, userText }) {
  const fullSystem = `${systemPrompt}\n\n${JSON_FORMAT_INSTRUCTION}`;
  const messages = [
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: userText },
  ];

  let rawText;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: fullSystem,
      messages,
    });
    rawText = response.content[0]?.text ?? '';
  } catch (err) {
    console.error('[Claude] API error:', err.message);
    throw new Error(`LLM call failed: ${err.message}`);
  }

  return parseLLMResponse(rawText);
}

// ─── Response parser ───────────────────────────────────────────────────────────

function parseLLMResponse(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[Claude] Non-JSON response, using fallback. Raw:', raw.slice(0, 200));
    return { response: raw.trim(), emotion: 'neutral', intensity: 0.5 };
  }

  const response = typeof parsed.response === 'string' ? parsed.response.trim() : '';
  const emotion = VALID_EMOTIONS.includes(parsed.emotion) ? parsed.emotion : 'neutral';
  const intensity = typeof parsed.intensity === 'number'
    ? Math.max(0, Math.min(1, parsed.intensity))
    : 0.5;

  if (!response) throw new Error('LLM returned empty response field');

  return { response, emotion, intensity };
}
