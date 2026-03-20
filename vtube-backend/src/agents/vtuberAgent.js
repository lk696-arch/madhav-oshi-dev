/**
 * vtuberAgent.js — Per-session orchestrator
 *
 * Pipeline:
 *   STT (Deepgram) → safety → LLM streaming → sentence tokens → Dev C TTS backend → memory
 *
 * thinkAndSpeak() streams each sentence from Claude directly to Dev C's TTS WebSocket.
 * Dev C owns ElevenLabs, audio queue, and barge-in cancel on their side.
 * We send interrupt() when Deepgram detects the user speaking during playback.
 */

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

  async checkInput(text) {
    return checkInputSafety(text);
  }

  async checkOutput(text) {
    return checkOutputSafety(text);
  }

  /**
   * thinkAndSpeak — streams LLM sentence tokens to Dev C's TTS backend
   *
   * Each sentence from Claude is sent immediately to ttsClient.sendTokens().
   * Dev C handles synthesis, audio queue, and streaming audio back to frontend.
   * Final flush signals end of response so Dev C can finalize the queue.
   *
   * @param {string}          userText
   * @param {TTSStreamClient} ttsClient     — Dev C's TTS WebSocket client
   * @param {Function}        [onFirstToken] — called with first sentence text (UI display)
   *
   * @returns {Promise<{ response: string, emotion: string, intensity: number }>}
   */
  async thinkAndSpeak(userText, ttsClient, onFirstToken) {
    const loreContext = this.rag.retrieve(userText);
    const history = this.memory.getHistory();
    const systemPrompt = buildSystemPrompt({ loreContext, memorySummary: this.memory.getSummary() });

    let firstSentence = true;

    const llmResult = await streamClaude({
      systemPrompt,
      history,
      userText,
      onSentence: (sentence) => {
        if (firstSentence) {
          firstSentence = false;
          if (onFirstToken) onFirstToken(sentence);
        }
        // Send each sentence to Dev C's TTS backend as it arrives
        ttsClient.sendTokens([sentence], false);
      },
    });

    // Flush — signals Dev C that LLM is done, finalize the TTS queue
    ttsClient.sendTokens([], true);

    return llmResult;
  }

  emotionToParams(emotion, intensity) {
    return emotionToLive2DParams(emotion, intensity);
  }

  saveMemory(userText, assistantText) {
    this.memory.addTurn(userText, assistantText);
  }

  cleanup() {
    this.memory.clear();
  }
}
