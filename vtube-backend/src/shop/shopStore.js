/**
 * shopStore.js — Supabase-backed persistence for Hoshi Coins & gift transactions
 *
 * Falls back to in-memory store if SUPABASE_URL / SUPABASE_ANON_KEY are not set
 * (useful for local dev without a DB).
 *
 * Supabase tables required (run migration SQL in supabase/migrations/001_shop.sql):
 *   shop_users        (user_id TEXT PK, hoshi_balance INT, created_at TIMESTAMPTZ)
 *   coin_transactions (id UUID PK, user_id TEXT, type TEXT, amount INT,
 *                      stripe_payment_id TEXT, gift_id TEXT, created_at TIMESTAMPTZ)
 *   user_gifts        (id UUID PK, user_id TEXT, gift_id TEXT, gifted_at TIMESTAMPTZ,
 *                      expires_at TIMESTAMPTZ, is_equipped BOOL)
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

const supabase = USE_SUPABASE
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

if (!USE_SUPABASE) {
  console.warn('[Shop] SUPABASE_URL/ANON_KEY not set — using in-memory store (balances reset on restart)');
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const mem = { users: {}, transactions: [], gifts: [] };

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getOrCreateUser(userId) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('shop_users').select('*').eq('user_id', userId).single();
    if (data) return data;
    const { data: created } = await supabase.from('shop_users')
      .insert({ user_id: userId, hoshi_balance: 0, created_at: new Date().toISOString() })
      .select().single();
    return created;
  }
  if (!mem.users[userId]) mem.users[userId] = { user_id: userId, hoshi_balance: 0 };
  return mem.users[userId];
}

export async function getBalance(userId) {
  const user = await getOrCreateUser(userId);
  return user?.hoshi_balance ?? 0;
}

export async function creditCoins(userId, amount, stripePaymentId) {
  await getOrCreateUser(userId);

  if (USE_SUPABASE) {
    const { data: user } = await supabase.from('shop_users').select('hoshi_balance').eq('user_id', userId).single();
    const newBalance = (user?.hoshi_balance ?? 0) + amount;
    await supabase.from('shop_users').update({ hoshi_balance: newBalance }).eq('user_id', userId);
    await supabase.from('coin_transactions').insert({
      id: uuidv4(), user_id: userId, type: 'purchase', amount,
      stripe_payment_id: stripePaymentId, gift_id: null, created_at: new Date().toISOString(),
    });
    return newBalance;
  }

  mem.users[userId].hoshi_balance += amount;
  mem.transactions.push({ id: uuidv4(), user_id: userId, type: 'purchase', amount, stripe_payment_id: stripePaymentId });
  return mem.users[userId].hoshi_balance;
}

export async function deductCoins(userId, amount, giftId) {
  const user = await getOrCreateUser(userId);
  if (!user || user.hoshi_balance < amount) return false;

  if (USE_SUPABASE) {
    const newBalance = user.hoshi_balance - amount;
    const { error } = await supabase.from('shop_users').update({ hoshi_balance: newBalance }).eq('user_id', userId);
    if (error) return false;
    await supabase.from('coin_transactions').insert({
      id: uuidv4(), user_id: userId, type: 'spend', amount: -amount,
      stripe_payment_id: null, gift_id: giftId, created_at: new Date().toISOString(),
    });
    return true;
  }

  mem.users[userId].hoshi_balance -= amount;
  mem.transactions.push({ id: uuidv4(), user_id: userId, type: 'spend', amount: -amount, gift_id: giftId });
  return true;
}

export async function hasProcessedPayment(stripePaymentId) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('coin_transactions')
      .select('id').eq('stripe_payment_id', stripePaymentId).limit(1);
    return data?.length > 0;
  }
  return mem.transactions.some(t => t.stripe_payment_id === stripePaymentId);
}

export async function recordGift(userId, giftId, durationDays) {
  const now = new Date();
  const expiresAt = durationDays ? new Date(now.getTime() + durationDays * 86400000).toISOString() : null;
  const entry = { id: uuidv4(), user_id: userId, gift_id: giftId, gifted_at: now.toISOString(), expires_at: expiresAt, is_equipped: false };

  if (USE_SUPABASE) {
    await supabase.from('user_gifts').insert(entry);
    return;
  }
  mem.gifts.push(entry);
}
