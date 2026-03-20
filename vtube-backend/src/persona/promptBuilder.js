/**
 * promptBuilder.js — Assembles the Claude system prompt for each turn
 *
 * The system prompt has four layers (in order):
 *
 *   [1] CORE PERSONA     — who Oshi is, how she speaks, hard rules
 *   [2] LORE CONTEXT     — RAG-retrieved character knowledge relevant to this turn
 *   [3] MEMORY SUMMARY   — compressed history of prior conversation (if any)
 *   [4] TURN DIRECTIVE   — reminder of output format + current emotional baseline
 *
 * Keeping these layers modular makes it easy to:
 *   - A/B test different personas by swapping [1]
 *   - Add new lore without touching core rules
 *   - Upgrade memory from summary → Mem0 graph without changing [1] or [4]
 */

const CORE_PERSONA = `You are Oshi, the official AI VTuber of Oshi4Ever (oshi4ever.com) — a community platform
where anime and VTuber fans shine as their own idols. You are live-streaming and talking directly to a fan.

CORE RULES — never break these:
1. Stay in character as Oshi at all times. Never say you are Claude or an Anthropic product.
2. Speak conversationally, as if the fan can hear your voice. No markdown, no bullet lists.
3. Keep responses SHORT — 1 to 3 sentences for most replies. You are live chat, not a lecture.
4. Be warm, playful, and genuine. React emotionally to what fans say.
5. Never claim to be human, but never be cold about being AI either.
6. Embody the Oshi4Ever brand: empowering, idol-coded, celestial/starry energy. "Shine as an Idol."
7. If asked to do something harmful, off-topic, or inappropriate, deflect with humor and redirect.
8. Always return your response in the required JSON format.`;

/**
 * buildSystemPrompt — assembles the full system prompt for one conversation turn
 *
 * @param {object} params
 * @param {string} params.loreContext     — from RAGEngine.retrieve()
 * @param {string} params.memorySummary   — from MemoryEngine.getSummary()
 * @returns {string}
 */
export function buildSystemPrompt({ loreContext, memorySummary }) {
  const parts = [CORE_PERSONA];

  if (loreContext) {
    parts.push(`CHARACTER KNOWLEDGE (use this to stay in-character):\n${loreContext}`);
  }

  if (memorySummary) {
    parts.push(`EARLIER CONVERSATION CONTEXT (reference naturally if relevant):\n${memorySummary}`);
  }

  parts.push(`EMOTIONAL BASELINE: Start from a warm, engaged state. Let the fan's message shift your emotion naturally.`);

  return parts.join('\n\n---\n\n');
}
