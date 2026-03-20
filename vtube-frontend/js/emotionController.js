/**
 * emotionController.js — Drives Live2D avatar expressions from emotion events
 *
 * Receives parameter objects from the backend { ParamEyeSmile: 0.8, ... }
 * and smoothly interpolates the Live2D model's current parameter values
 * toward those targets on every animation frame.
 *
 * Interpolation approach:
 *   We use a simple exponential decay lerp: current += (target - current) * SPEED
 *   This gives snappy-but-smooth transitions — fast at first, easing in at the end.
 *   SPEED = 0.08 means roughly 8% of the gap is closed per frame (60fps ≈ 130ms settle).
 *
 * Usage:
 *   const controller = new EmotionController(live2dModel);
 *   controller.applyEmotion({ ParamEyeSmile: 1.0, ParamMouthForm: 1.0, ... });
 *   controller.startLoop();  // drives the lerp on requestAnimationFrame
 */

const LERP_SPEED = 0.08;   // interpolation speed per frame
const RETURN_SPEED = 0.03; // speed to return to neutral when idle

// Neutral baseline — all params that should return to 0 when idle
const NEUTRAL_PARAMS = {
  ParamEyeSmile: 0.0,
  ParamBrowLY: 0.0,
  ParamBrowRY: 0.0,
  ParamBrowFrownL: 0.0,
  ParamBrowFrownR: 0.0,
  ParamMouthForm: 0.0,
  ParamCheek: 0.0,
  ParamAngleX: 0.0,
  ParamAngleY: 0.0,
  ParamAngleZ: 0.0,
  ParamBodyAngleX: 0.0,
};

export class EmotionController {
  constructor(model) {
    this.model = model;         // Live2D Cubism model instance (or null in demo mode)
    this.targets = {};          // current target parameter values
    this.current = {};          // current interpolated values
    this.rafId = null;
    this.isRunning = false;
    this.idleTimer = null;
    this.IDLE_TIMEOUT_MS = 8000; // return to neutral after 8s of no new emotion
  }

  /**
   * applyEmotion — sets new parameter targets from backend expression event
   * @param {Record<string, number>} params  — from server { type: "expression", params: {...} }
   */
  applyEmotion(params) {
    this.targets = { ...params };

    // Update UI badge
    // (emotion label/intensity come from the llm_response message, handled in app.js)

    // Reset idle timer
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this._returnToNeutral(), this.IDLE_TIMEOUT_MS);
  }

  /**
   * startLoop — begins the rAF interpolation loop
   */
  startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._tick();
  }

  /**
   * stopLoop — cancels the rAF loop
   */
  stopLoop() {
    this.isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _tick() {
    if (!this.isRunning) return;

    for (const [key, target] of Object.entries(this.targets)) {
      const curr = this.current[key] ?? 0;
      const next = curr + (target - curr) * LERP_SPEED;
      this.current[key] = Math.abs(next - target) < 0.001 ? target : next;

      // Apply to Live2D model (if loaded)
      this._setParam(key, this.current[key]);
    }

    this.rafId = requestAnimationFrame(() => this._tick());
  }

  _returnToNeutral() {
    this.targets = { ...NEUTRAL_PARAMS };
  }

  /**
   * _setParam — applies a parameter value to the Live2D model
   *
   * The Live2D Cubism Core API: model.parameters.ids[i] / model.parameters.values[i]
   * We look up the parameter index by ID and set its value directly.
   */
  _setParam(paramId, value) {
    if (!this.model) {
      // Demo mode: update the canvas with a simple visual indicator
      this._demoRender(paramId, value);
      return;
    }

    const ids = this.model.parameters.ids;
    const idx = ids.indexOf(paramId);
    if (idx !== -1) {
      this.model.parameters.values[idx] = value;
    }
  }

  /**
   * _demoRender — placeholder visualizer used when no Live2D model is loaded.
   * Draws simple face elements on the canvas to demonstrate expression changes.
   * Remove this when the real Live2D model is connected.
   */
  _demoRender(paramId, value) {
    // Only redraw on key params to avoid thrashing
    if (!['ParamEyeSmile', 'ParamMouthForm', 'ParamCheek'].includes(paramId)) return;

    const canvas = document.getElementById('live2d-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const eyeSmile = this.current['ParamEyeSmile'] ?? 0;
    const mouthForm = this.current['ParamMouthForm'] ?? 0;
    const cheek = this.current['ParamCheek'] ?? 0;

    // Face circle
    ctx.beginPath();
    ctx.arc(cx, cy, 160, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1f4a';
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Eyes
    drawEye(ctx, cx - 55, cy - 30, eyeSmile);
    drawEye(ctx, cx + 55, cy - 30, eyeSmile);

    // Cheeks
    if (cheek > 0.1) {
      ctx.globalAlpha = cheek * 0.5;
      ctx.beginPath();
      ctx.ellipse(cx - 80, cy + 20, 30, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f472b6';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 80, cy + 20, 30, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Mouth
    drawMouth(ctx, cx, cy + 60, mouthForm);

    // Emotion label
    ctx.fillStyle = 'rgba(167,139,250,0.6)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`smile:${eyeSmile.toFixed(2)}  mouth:${mouthForm.toFixed(2)}`, cx, cy + 150);
  }
}

// ── Canvas demo helpers ─────────────────────────────────────────────────────────

function drawEye(ctx, x, y, smileAmount) {
  ctx.save();
  ctx.translate(x, y);

  // Eye white
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 18 - smileAmount * 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();

  // Pupil
  ctx.beginPath();
  ctx.arc(0, 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#1e0a3c';
  ctx.fill();

  // Shine
  ctx.beginPath();
  ctx.arc(-3, -2, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Smile crease
  if (smileAmount > 0.3) {
    ctx.beginPath();
    ctx.arc(0, 4, 18, Math.PI * 0.1, Math.PI * 0.9);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.globalAlpha = smileAmount;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawMouth(ctx, x, y, mouthForm) {
  ctx.save();
  ctx.translate(x, y);

  const curve = mouthForm * 25;  // positive = smile, negative = frown

  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.quadraticCurveTo(0, curve, 40, 0);
  ctx.strokeStyle = '#f472b6';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fill smile mouth shape
  if (mouthForm > 0.3) {
    ctx.beginPath();
    ctx.moveTo(-35, 0);
    ctx.quadraticCurveTo(0, curve + 10, 35, 0);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.3)';
    ctx.fill();
  }

  ctx.restore();
}
