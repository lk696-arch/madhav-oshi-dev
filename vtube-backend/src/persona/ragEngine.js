/**
 * ragEngine.js — Lightweight RAG retrieval for character lore
 *
 * POC implementation uses keyword overlap scoring — fast, zero-dependency,
 * good enough for a bounded lore document set (<50 entries).
 *
 * Week 2 upgrade path:
 *   1. Generate embeddings for each CHARACTER_LORE entry at startup
 *      (OpenAI text-embedding-3-small or Anthropic embeddings)
 *   2. Store in pgvector (Supabase) or an in-memory HNSW index (hnswlib-node)
 *   3. Replace retrieve() with cosine similarity search against user query embedding
 *
 * Retrieval quality comparison:
 *   Keyword (POC):   Works well for direct topic matches; misses paraphrases
 *   Embedding (v2):  Handles synonyms, context, implicit references
 */

import { CHARACTER_LORE } from './characterLore.js';

const MAX_CHARS = parseInt(process.env.RAG_MAX_CHARS || '800', 10);

export class RAGEngine {
  constructor() {
    // Pre-process: normalize tags to lowercase sets for fast lookup
    this.index = CHARACTER_LORE.map(doc => ({
      ...doc,
      tagSet: new Set(doc.tags.map(t => t.toLowerCase())),
    }));
  }

  /**
   * retrieve — returns relevant lore text for injection into the system prompt
   *
   * Scoring: count how many lore tags appear in the user's query tokens.
   * Returns the top-scored documents, concatenated up to MAX_CHARS.
   *
   * @param {string} query  — user's raw message
   * @returns {string}      — concatenated lore text, or empty string if no match
   */
  retrieve(query) {
    const queryTokens = this._tokenize(query);

    // Score each lore document
    const scored = this.index.map(doc => ({
      doc,
      score: this._score(queryTokens, doc.tagSet),
    }));

    // Sort descending, take docs with score > 0
    const relevant = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.doc);

    // Always include the identity doc as baseline context
    const identityDoc = this.index.find(d => d.id === 'identity');
    const withIdentity = identityDoc && !relevant.includes(identityDoc)
      ? [identityDoc, ...relevant]
      : relevant;

    // Concatenate up to MAX_CHARS
    let output = '';
    for (const doc of withIdentity) {
      const candidate = output ? `${output}\n\n${doc.content}` : doc.content;
      if (candidate.length > MAX_CHARS) break;
      output = candidate;
    }

    return output;
  }

  /**
   * _tokenize — splits text into lowercase word tokens, strips punctuation
   */
  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * _score — counts how many of the doc's tags appear in the query tokens
   */
  _score(queryTokens, tagSet) {
    let hits = 0;
    for (const token of queryTokens) {
      if (tagSet.has(token)) hits++;
      // Also check if any tag is a substring of a longer token (e.g., "games" matches "game")
      for (const tag of tagSet) {
        if (token.includes(tag) || tag.includes(token)) hits += 0.5;
      }
    }
    return hits;
  }
}
