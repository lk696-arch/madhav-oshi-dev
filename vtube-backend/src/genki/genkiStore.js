/**
 * genkiStore.js — File-based persistence for genki user records
 *
 * Stores user records as JSON. No DB setup required for this sprint.
 * Each record: { genki_value, last_active_at, last_checkin_at }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const STORE_FILE = join(DATA_DIR, 'genki.json');

function load() {
  if (!existsSync(STORE_FILE)) return {};
  return JSON.parse(readFileSync(STORE_FILE, 'utf8'));
}

function save(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

export function getUser(userId) {
  const store = load();
  if (!store[userId]) {
    store[userId] = {
      genki_value: 80,
      last_active_at: new Date().toISOString(),
      last_checkin_at: null,
    };
    save(store);
  }
  return store[userId];
}

export function saveUser(userId, record) {
  const store = load();
  store[userId] = record;
  save(store);
}
