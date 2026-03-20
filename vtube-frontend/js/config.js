/**
 * config.js — Runtime backend URL configuration
 *
 * AFTER deploying the Node.js backend to Railway:
 *   1. Copy your Railway WebSocket URL (e.g. wss://vtube-backend-production.up.railway.app/ws)
 *   2. Replace the placeholder string below with that URL
 *   3. Redeploy the frontend on Vercel (it auto-deploys on every git push)
 *
 * For local development, keep the localhost URL as-is.
 */

window.WS_BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'ws://localhost:3001/ws'
  : 'wss://YOUR_RAILWAY_BACKEND_URL.railway.app/ws';   // <-- replace this after Railway deploy
