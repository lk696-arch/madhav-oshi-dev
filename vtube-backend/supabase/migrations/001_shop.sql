-- Hoshi Coins shop tables
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor

create table if not exists shop_users (
  user_id       text primary key,
  hoshi_balance integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists coin_transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null,
  type               text not null check (type in ('purchase', 'spend')),
  amount             integer not null,
  stripe_payment_id  text,
  gift_id            text,
  created_at         timestamptz not null default now()
);

create table if not exists user_gifts (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  gift_id     text not null,
  gifted_at   timestamptz not null default now(),
  expires_at  timestamptz,
  is_equipped boolean not null default false
);

-- Index for idempotency check on webhook
create index if not exists idx_coin_txn_stripe_id on coin_transactions(stripe_payment_id);
