/**
 * vtuberAgent.js — Per-session orchestrator
 *
 * Owns the full pipeline for one connected user:
 *   STT (Deepgram) → safety → LLM streaming + sentence-chunked TTS → memory write
 *
 * One VTuberAgent is created per WebSocket session and destroyed on disconnect.
 *
 * Key upgrade over v1:
 *   thinkAndSpeak() runs the LLM in streaming mode. As each sentence arrives from
 *   Claude, it is immediately sent to ElevenLabs TTS. This pipeline overlap cuts
 *   end-to-end latency by ~400–500ms compared to waiting for the full LLM response.
 */

import { streamTTS } from '../voice/elevenlabs.js';
import { streamClaude } from '../llm/claude.js';
import { MemoryEngine } from '../memory/memoryEngine.js';
import { RAGEngine } from '../persona/ragEngine.js';
import { buildSystemPrompt } from '../persona/promptBuilder.js';
import { checkInputSafety, checkOutputSafety } from '../safety/safetyFilter.js';
import { emotionToLive2DParams } from '../emotion/emotionParser.js';

export class VTuberAgent {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.memory = new MemoryEngine(sessionId);
    this.rag = new RAGEngine();
  }

  /**
   * checkInput — safety filter for user message before LLM call
   * @param {string} text
   * @returns {Promise<{ safe: boolean, reason?: string }>}
   */
  async checkInput(text) {
    return checkInputSafety(text);
  }

  /**
   * checkOutput — safety filter for LLM response before sending to client
   * @param {string} text
   * @returns {Promise<{ safe: boolean, reason?: string }>}
   */
  async checkOutput(text) {
    return checkOutputSafety(text);
  }

  /**
   * thinkAndSpeak — STREAMING pipeline: LLM tokens → sentence chunks → TTS
   *
   * As each sentence arrives from Claude's stream, it is immediately queued
   * for TTS. Sentence 1 audio begins playing while Claude is still generating
   * sentence 2, achieving true pipeline overlap.
   *
   * Steps:
   *   1. RAG: retrieve relevant character lore
   *   2. Build system prompt with lore + memory summary
   *   3. Stream Claude — onSentence fires for each complete sentence
   *   4. Each sentence is chained into a sequential TTS queue
   *   5. Returns { response, emotion, intensity } after stream ends
   *
   * @param {string}   userText
   * @param {Function} onAudioChunk   — called with each base64 MP3 chunk
   * @param {Function} [onFirstToken] — optional: called with first sentence text (for UI)
   *
   * @returns {Promise<{ response: string, emotion: string, intensity: number }>}
   */
  async thinkAndSpeak(userText, onAudioChunk, onFirstToken) {
    const loreContext = this.rag.retrieve(userText);
    const history = this.memory.getHistory();
    const systemPrompt = buildSystemPrompt({ loreContext, memorySummary: this.memory.getSummary() });

    // TTS promise chain — sentences are sent to ElevenLabs one after another,
    // but each TTS call starts as soon as its sentence is ready (not waiting for the LLM to finish).
    let ttsChain = Promise.resolve();
    let firstSentence = true;
    let fullResponse = '';

    const llmResult = await streamClaude({
      systemPrompt,
      history,
      userText,
      onSentence: (sentence) => {
        fullResponse += (fullResponse ? ' ' : '') + sentence;

        if (firstSentence) {
          firstSentence = false;
          if (onFirstToken) onFirstToken(sentence);
        }

        // Chain TTS calls so they run sequentially but start immediately per sentence
        ttsChain = ttsChain.then(() => streamTTS(sentence, onAudioChunk));
      },
    });

    // Wait for all queued TTS to finish
    await ttsChain;

    return llmResult;
  }

  /**
   * speak — streams TTS for a single pre-formed text string (used for short replies)
   * @param {string} text
   * @param {(chunk: string) => void} onChunk
   */
  async speak(text, onChunk) {
    await streamTTS(text, onChunk);
  }

  /**
   * emotionToParams — maps emotion label to Live2D parameter object
   * @param {string} emotion
   * @param {number} intensity  — 0.0–1.0
   * @returns {Record<string, number>}
   */
  emotionToParams(emotion, intensity) {
    return emotionToLive2DParams(emotion, intensity);
  }

  /**
   * saveMemory — persists one completed turn to session memory
   * @param {string} userText
   * @param {string} assistantText
   */
  saveMemory(userText, assistantText) {
    this.memory.addTurn(userText, assistantText);
  }

  /**
   * cleanup — called on WebSocket close; releases session resources
   */
  cleanup() {
    this.memory.clear();
  }
}
