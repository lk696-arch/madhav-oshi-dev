/**
 * memoryEngine.js — Per-session conversation memory
 *
 * Architecture (three tiers):
 *
 *   Tier 1 — Active Context (in-memory, per session)
 *     Last N turns passed directly to Claude as message history.
 *     Cleared when session ends.
 *
 *   Tier 2 — Rolling Summary (in-memory)
 *     When history exceeds MAX_TURNS, oldest turns are summarized into a
 *     compact text block injected into the system prompt.
 *     Prevents context window bloat while preserving conversational continuity.
 *
 *   Tier 3 — Long-term Fan Memory (stub, upgrade path)
 *     Mem0 / pgvector integration would sit here for persistent cross-session
 *     user facts (name, preferences, recurring topics).
 *     POC stores nothing to disk — mark with TODO comments for Week 2.
 *
 * Note on Mem0 upgrade:
 *   Replace MemoryEngine.addTurn() with a Mem0 client.add() call and
 *   replace getHistory() with client.search() to get semantically relevant turns.
 */

const MAX_TURNS = parseInt(process.env.MEMORY_MAX_TURNS || '20', 10);

export class MemoryEngine {
  constructor(sessionId) {
    this.sessionId = sessionId;
    // Tier 1: full turn objects { role, content }
    this.turns = [];
    // Tier 2: summary of turns that have scrolled out of the active window
    this.rollingsum = '';
  }

  /**
   * addTurn — adds a completed user+assistant exchange to memory
   * @param {string} userText
   * @param {string} assistantText
   */
  addTurn(userText, assistantText) {
    this.turns.push({ role: 'user', content: userText });
    this.turns.push({ role: 'assistant', content: assistantText });

    // Summarize overflow turns to keep active history bounded
    if (this.turns.length > MAX_TURNS * 2) {
      this._summarizeOldest();
    }
  }

  /**
   * getHistory — returns recent turns as a Claude-compatible messages array
   * @returns {Array<{ role: string, content: string }>}
   */
  getHistory() {
    // Return last MAX_TURNS pairs (MAX_TURNS * 2 messages)
    const window = this.turns.slice(-(MAX_TURNS * 2));
    return window;
  }

  /**
   * getSummary — returns rolling summary text for system prompt injection
   * @returns {string}
   */
  getSummary() {
    return this.rollingsum;
  }

  /**
   * clear — wipes session memory on disconnect
   */
  clear() {
    this.turns = [];
    this.rollingsum = '';
  }

  /**
   * _summarizeOldest — moves the oldest 10 turns into rolling summary text.
   *
   * POC: simple concatenation. Week 2 upgrade: call Claude to generate a
   * compressed narrative summary ("Fan mentioned they like horror anime, asked
   * about Neuro-sama, seemed excited when VTuber sang").
   */
  _summarizeOldest() {
    const overflow = this.turns.splice(0, 10);  // remove oldest 10 messages
    const overflowText = overflow
      .map(t => `${t.role === 'user' ? 'Fan' : 'Oshi'}: ${t.content}`)
      .join('\n');

    this.rollingsum = this.rollingsum
      ? `${this.rollingsum}\n---\n${overflowText}`
      : overflowText;

    // Cap summary size to avoid prompt bloat
    if (this.rollingsum.length > 2000) {
      this.rollingsum = this.rollingsum.slice(-2000);
    }
  }
}
