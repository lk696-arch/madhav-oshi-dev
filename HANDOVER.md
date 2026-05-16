# Oshi Dev — Backend Handover Document
**Prepared by:** Leela Madhav K (Dev B — Backend)
**Date:** May 2026
**Handover deadline:** Wednesday 6 May 2026

---

## 1. Repository

| Item | Detail |
|---|---|
| GitHub repo | https://github.com/lk696-arch/madhav-oshi-dev |
| Branch | `main` (auto-deploys to Render on push) |
| Backend directory | `vtube-backend/` |

**To transfer ownership:** Go to GitHub repo → Settings → Transfer → enter Oshi team GitHub account.

---

## 2. Live Deployment

| Item | Detail |
|---|---|
| Platform | Render (free tier) |
| Service name | `madhav-oshi-dev-1` |
| Base URL | https://madhav-oshi-dev-1.onrender.com |
| Health check | https://madhav-oshi-dev-1.onrender.com/health |
| Render account | Personal account — `lk696@nau.edu` |

**To transfer:** Render → Settings → Team → invite Oshi team email, then transfer service ownership. Or redeploy from GitHub to Oshi's own Render account.

> ⚠️ Free tier spins down after 15 min inactivity. First request takes 30–60s to wake up. Upgrade to paid tier ($7/mo) to keep it always-on for production.

---

## 3. Environment Variables

All of these must be set in Render → Environment for the service to function.

| Variable | Description | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude LLM API key | console.anthropic.com |
| `DEEPGRAM_API_KEY` | Speech-to-text API key | console.deepgram.com |
| `TTS_BACKEND_URL` | Tarun's TTS WebSocket URL | `wss://oshi-ai-vtuber-backend.onrender.com/api/tts/stream` |
| `STRIPE_SECRET_KEY` | Stripe test secret key | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe dashboard → Developers → Webhooks → brilliant-spark |
| `SUPABASE_URL` | Supabase project URL | `https://vjnaztexiyeajxqyusww.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase → Settings → API |
| `CORS_ORIGIN` | Allowed frontend origins | `https://oshiweb.vercel.app,http://localhost:5500` |
| `APP_URL` | Frontend base URL | `https://oshiweb.vercel.app` |
| `CLAUDE_MODEL` | LLM model ID | `claude-haiku-4-5-20251001` (fast) or `claude-sonnet-4-6` (higher quality) |
| `NODE_ENV` | Environment flag | `production` |
| `PORT` | Server port | `3001` (Render sets this automatically) |

---

## 4. Database (Supabase)

| Item | Detail |
|---|---|
| Platform | Supabase (free tier) |
| Project | `lk696-arch's Project` |
| Project ID | `vjnaztexiyeajxqyusww` |
| Account | `lk696@nau.edu` |

**Tables:**
- `shop_users` — user coin balances
- `coin_transactions` — full purchase + spend history
- `user_gifts` — gifts sent per user

**Migration SQL:** `vtube-backend/supabase/migrations/001_shop.sql`

**To transfer:** Supabase → Settings → Team → invite Oshi team email.

---

## 5. Third-Party Services

| Service | Purpose | Account | Notes |
|---|---|---|---|
| Stripe | Coin purchases | `team@oshi4ever.com` | Leni manages — ask her for login |
| ElevenLabs | TTS voice | Tarun's account | Voice ID: `ocZQ262SsZb9RIxcQBOj` |
| Deepgram | Speech-to-text | Dev account | Get new key from console.deepgram.com |
| Anthropic | Claude LLM | Dev account | Get new key from console.anthropic.com |
| Render | Backend hosting | `lk696@nau.edu` | Transfer to Oshi account |
| Supabase | Database | `lk696@nau.edu` | Transfer to Oshi account |

---

## 6. API Endpoints

Base URL: `https://madhav-oshi-dev-1.onrender.com`

### Core
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check — returns `{"status":"ok"}` |
| POST | `/api/chat` | Send text message, get Oshi's response |
| WS | `/ws` | WebSocket — full pipeline (STT + LLM + TTS + audio) |

### Session / Genki
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/session-open` | Calculate genki decay + restore on session start |

### Gift Shop
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/shop/catalogue` | All 24 gifts + 5 coin bundles |
| GET | `/api/shop/balance/:userId` | User's current Hoshi Coin balance |
| POST | `/api/coins/checkout` | Create Stripe Checkout Session |
| POST | `/api/coins/webhook` | Stripe webhook — credits coins after payment |
| POST | `/api/gifts/send` | Spend coins, apply genki boost |

### Request formats

**POST /api/chat**
```json
{ "text": "hey what games do you like?", "userId": "user-123" }
```
Response: `{ "text": "...", "emotion": "playful", "intensity": 0.8 }`

**POST /api/coins/checkout**
```json
{ "userId": "user-123", "bundleId": "daisuki" }
```
Response: `{ "checkout_url": "https://checkout.stripe.com/...", "session_id": "cs_..." }`

**POST /api/gifts/send**
```json
{ "userId": "user-123", "giftId": "onigiri" }
```
Response: `{ "success": true, "genki_boost": 5, "new_balance": 80 }`

---

## 7. Architecture Overview

```
User (browser)
    │
    ├── HTTP POST /api/chat ──────────────────► Claude LLM (Anthropic)
    │                                               │
    │                                           Response
    │
    └── WebSocket /ws
            │
            ├── Audio chunks ──► Deepgram STT ──► transcript
            │                                         │
            │                                     Claude LLM
            │                                         │
            │                              Sentence chunks ──► Tarun's TTS (ElevenLabs)
            │                                                         │
            └──────────────────────────── Audio back to browser ◄────┘
```

---

## 8. Codebase Structure

```
vtube-backend/
├── src/
│   ├── server.js              # Express + WebSocket server, all routes
│   ├── agents/
│   │   └── vtuberAgent.js     # LLM orchestration, memory, safety
│   ├── llm/
│   │   └── claude.js          # Anthropic streaming integration
│   ├── voice/
│   │   ├── deepgram.js        # STT WebSocket client
│   │   └── ttsStreamClient.js # Tarun's TTS WebSocket client
│   ├── persona/
│   │   ├── promptBuilder.js   # System prompt assembly
│   │   ├── characterLore.js   # Oshi character knowledge base
│   │   └── ragEngine.js       # Keyword-based lore retrieval
│   ├── memory/
│   │   └── memoryEngine.js    # 20-turn rolling conversation memory
│   ├── emotion/
│   │   └── emotionParser.js   # Extracts emotion + intensity from LLM output
│   ├── safety/
│   │   └── safetyFilter.js    # Input/output content filtering
│   ├── genki/
│   │   ├── genkiEngine.js     # Decay/restore logic
│   │   └── genkiStore.js      # Genki persistence
│   └── shop/
│       ├── shopStore.js       # Supabase coin/gift persistence
│       ├── giftCatalogue.js   # 24 gift items seeded
│       └── coinBundles.js     # 5 Hoshi Coin bundles + Stripe price IDs
├── supabase/
│   └── migrations/
│       └── 001_shop.sql       # Run this in Supabase SQL editor
├── .env.example               # All required env vars documented
└── package.json
```

---

## 9. Known Limitations / Next Steps

| Item | Notes |
|---|---|
| Free tier cold start | Render free tier sleeps after inactivity. Upgrade to paid ($7/mo) for always-on |
| Genki store | Still file-based — should migrate to Supabase same as shop |
| Gift image assets | Backend ready — frontend needs image URLs mapped to gift IDs |
| Fan rank system | Not built — planned for v2 (see Sprint 3 brief) |
| WebSocket auth | No auth on `/ws` — any client can connect. Add token auth before public launch |
| Oshi Forever + Ichiban | Stripe price IDs are test-mode only — need live-mode prices before real payments |

---

## 10. Local Development

```bash
git clone https://github.com/lk696-arch/madhav-oshi-dev
cd madhav-oshi-dev/vtube-backend
cp .env.example .env
# Fill in all values in .env
npm install
npm run dev
# Server runs at http://localhost:3001
```

---

*For questions, contact Leela Madhav K — `lk696@nau.edu`*
