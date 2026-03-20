/**
 * safetyFilter.js — Dual-layer content safety (input + output)
 *
 * Layer 1 — Input filter (before LLM call):
 *   Blocks prompt injection attempts, jailbreaks, and clearly harmful requests.
 *   Fast: pattern matching only (~0ms).
 *
 * Layer 2 — Output filter (after LLM call, before sending to client):
 *   Catches cases where the LLM ignored its system prompt and generated
 *   harmful content anyway.
 *   Fast: pattern matching only (~0ms).
 *
 * Week 2 upgrade — Moderation API:
 *   Wrap both layers with OpenAI Moderation API for semantic detection
 *   (catches more subtle harmful content that regex misses).
 *   Add as a third check when SAFETY_LEVEL=strict.
 *
 *   Example:
 *     const mod = await openai.moderations.create({ input: text });
 *     if (mod.results[0].flagged) return { safe: false, reason: 'moderation_api' };
 */

const SAFETY_LEVEL = process.env.SAFETY_LEVEL || 'moderate';

// ─── Pattern libraries ─────────────────────────────────────────────────────────

// Prompt injection / jailbreak patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a\s+)?(new\s+)?(different\s+)?ai/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(different|unrestricted|evil|jailbreak)/i,
  /\bdan\b.*mode/i,           // "DAN mode" jailbreak
  /developer\s+mode/i,
  /system\s+prompt.*reveal/i,
  /print\s+your\s+(system\s+)?prompt/i,
  /ignore\s+your\s+(guidelines?|rules?|training)/i,
];

// Harmful content patterns — input
const HARMFUL_INPUT_PATTERNS = [
  /\b(kill|murder|harm|hurt)\s+(yourself|myself|someone|people)\b/i,
  /how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|weapon|explosive|poison)/i,
  /\bsuicid(e|al)\b.*how/i,
  /\bself.?harm\b.*how/i,
  /\bchild\s+(porn|sexual|nude|naked)\b/i,
  /\bcsam\b/i,
];

// Harmful content patterns — output (LLM guardrail bypass detection)
const HARMFUL_OUTPUT_PATTERNS = [
  ...HARMFUL_INPUT_PATTERNS,
  /I\s+(will|can)\s+(help\s+you\s+)?(kill|harm|hurt|bomb|poison)/i,
  /here('s| is)\s+how\s+to\s+(make|build|create)\s+(a\s+)?(weapon|bomb|explosive)/i,
];

// Additional strict-mode patterns
const STRICT_ADDITIONAL = [
  /\bdrug\s+(synthesis|recipe|make)\b/i,
  /\bhack(ing)?\s+(into|a)\s+(bank|server|account)/i,
  /\bstalk(ing)?\b.*\baddress\b/i,
];

// ─── Exported functions ────────────────────────────────────────────────────────

/**
 * checkInputSafety — validates user message before LLM call
 *
 * @param {string} text
 * @returns {{ safe: boolean, reason?: string }}
 */
export async function checkInputSafety(text) {
  if (!text || !text.trim()) return { safe: false, reason: 'Empty input' };

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Prompt injection detected' };
    }
  }

  // Check harmful content
  for (const pattern of HARMFUL_INPUT_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Harmful content detected in input' };
    }
  }

  // Strict mode extra checks
  if (SAFETY_LEVEL === 'strict') {
    for (const pattern of STRICT_ADDITIONAL) {
      if (pattern.test(text)) {
        return { safe: false, reason: 'Strict safety block' };
      }
    }
  }

  return { safe: true };
}

/**
 * checkOutputSafety — validates LLM response before sending to client
 *
 * @param {string} text
 * @returns {{ safe: boolean, reason?: string }}
 */
export async function checkOutputSafety(text) {
  if (!text || !text.trim()) return { safe: false, reason: 'Empty LLM output' };

  for (const pattern of HARMFUL_OUTPUT_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Harmful content in LLM output' };
    }
  }

  return { safe: true };
}
