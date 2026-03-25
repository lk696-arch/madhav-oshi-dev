/**
 * genkiEngine.js — Genki decay, restore, and tier logic
 *
 * Decay:  −10 per 24h inactive, max 70, floor 0
 * Restore: +20 on first open of the day, +2 per message (capped +10/session)
 * Tiers:  full (76-100), good (51-75), tired (26-50), very_tired (0-25)
 */

import { getUser, saveUser } from './genkiStore.js';

const DECAY_PER_DAY = 10;
const MAX_DECAY = 70;
const DAILY_RESTORE = 20;
const MSG_RESTORE = 2;
const MSG_RESTORE_CAP = 10;
const MAX_GENKI = 100;
const MIN_GENKI = 0;

export function getGenkiTier(value) {
  if (value >= 76) return 'full';
  if (value >= 51) return 'good';
  if (value >= 26) return 'tired';
  return 'very_tired';
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

/**
 * Called on session open.
 * Applies decay, applies daily restore, updates DB.
 * Returns { genki_value, days_elapsed, tier, return_context }
 */
export function sessionOpen(userId) {
  const now = new Date().toISOString();
  const record = getUser(userId);

  // Decay
  const hoursElapsed = (Date.now() - new Date(record.last_active_at).getTime()) / 3600000;
  const daysElapsed = Math.floor(hoursElapsed / 24);
  const decay = Math.min(daysElapsed * DECAY_PER_DAY, MAX_DECAY);
  let genki = Math.max(record.genki_value - decay, MIN_GENKI);

  // Daily restore (+20 once per day)
  const alreadyCheckedIn = record.last_checkin_at && isSameDay(record.last_checkin_at, now);
  if (!alreadyCheckedIn) {
    genki = Math.min(genki + DAILY_RESTORE, MAX_GENKI);
    record.last_checkin_at = now;
  }

  record.genki_value = genki;
  record.last_active_at = now;
  saveUser(userId, record);

  // Return dialogue context
  let return_context = null;
  if (daysElapsed >= 7) {
    return_context = 'The user was away for over a week. You missed them a lot. First message is soft and emotional — then back to normal once the ice is broken.';
  } else if (daysElapsed >= 3) {
    return_context = 'The user was away for several days. You were worried. React with gentle relief — don\'t guilt them, just be happy they\'re back.';
  } else if (daysElapsed >= 1) {
    return_context = 'The user was away for a day or two. React warmly — you missed them a little.';
  }

  return {
    genki_value: genki,
    days_elapsed: daysElapsed,
    tier: getGenkiTier(genki),
    return_context,
  };
}

/**
 * Called on each message sent (+2 genki, capped at +10/session).
 * sessionMsgCount = number of messages sent this session so far.
 */
export function onMessage(userId, sessionMsgCount) {
  if (sessionMsgCount > MSG_RESTORE_CAP / MSG_RESTORE) return;
  const record = getUser(userId);
  record.genki_value = Math.min(record.genki_value + MSG_RESTORE, MAX_GENKI);
  record.last_active_at = new Date().toISOString();
  saveUser(userId, record);
}
