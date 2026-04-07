/**
 * shopStore.js — File-based persistence for Hoshi Coins & gift transactions
 *
 * Stores:
 *   users:            { [userId]: { hoshi_balance, created_at } }
 *   coin_transactions: [ { id, user_id, type, amount, stripe_payment_id, gift_id, created_at } ]
 *   user_gifts:        [ { id, user_id, gift_id, gifted_at, expires_at, is_equipped } ]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

function filePath(name) { return join(DATA_DIR, `${name}.json`); }

function load(name) {
  const fp = filePath(name);
  if (!existsSync(fp)) return name === 'coin_transactions' || name === 'user_gifts' ? [] : {};
  return JSON.parse(readFileSync(fp, 'utf8'));
}

function save(name, data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

// ── Users ────────────────────────────────────────────────────────────────────

export function getOrCreateUser(userId) {
  const users = load('shop_users');
  if (!users[userId]) {
    users[userId] = { hoshi_balance: 0, created_at: new Date().toISOString() };
    save('shop_users', users);
  }
  return users[userId];
}

export function getBalance(userId) {
  return getOrCreateUser(userId).hoshi_balance;
}

export function creditCoins(userId, amount, stripePaymentId) {
  const users = load('shop_users');
  const user = users[userId] || { hoshi_balance: 0, created_at: new Date().toISOString() };
  user.hoshi_balance += amount;
  users[userId] = user;
  save('shop_users', users);

  const txns = load('coin_transactions');
  txns.push({
    id: uuidv4(),
    user_id: userId,
    type: 'purchase',
    amount,
    stripe_payment_id: stripePaymentId,
    gift_id: null,
    created_at: new Date().toISOString(),
  });
  save('coin_transactions', txns);
  return user.hoshi_balance;
}

export function deductCoins(userId, amount, giftId) {
  const users = load('shop_users');
  const user = users[userId];
  if (!user || user.hoshi_balance < amount) return false;
  user.hoshi_balance -= amount;
  users[userId] = user;
  save('shop_users', users);

  const txns = load('coin_transactions');
  txns.push({
    id: uuidv4(),
    user_id: userId,
    type: 'spend',
    amount: -amount,
    stripe_payment_id: null,
    gift_id: giftId,
    created_at: new Date().toISOString(),
  });
  save('coin_transactions', txns);
  return true;
}

// ── Idempotency ───────────────────────────────────────────────────────────────

export function hasProcessedPayment(stripePaymentId) {
  const txns = load('coin_transactions');
  return txns.some(t => t.stripe_payment_id === stripePaymentId);
}

// ── User gifts ────────────────────────────────────────────────────────────────

export function recordGift(userId, giftId, durationDays) {
  const gifts = load('user_gifts');
  const now = new Date();
  const expiresAt = durationDays
    ? new Date(now.getTime() + durationDays * 86400000).toISOString()
    : null;
  gifts.push({
    id: uuidv4(),
    user_id: userId,
    gift_id: giftId,
    gifted_at: now.toISOString(),
    expires_at: expiresAt,
    is_equipped: false,
  });
  save('user_gifts', gifts);
}
