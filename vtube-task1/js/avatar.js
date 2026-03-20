/**
 * avatar.js — Animated canvas VTuber face
 *
 * Renders a fully animated 2D character on HTML canvas.
 * No external libraries. Uses requestAnimationFrame for smooth 60fps animation.
 *
 * Features:
 *   - Idle blinking (random interval 2–5s)
 *   - Breathing (subtle body bob)
 *   - Hair physics (gentle sway)
 *   - 6 emotion states: neutral, happy, excited, shy, sad, surprised
 *   - Lip sync (mouth moves while speaking)
 *   - Smooth lerp transitions between states
 */

const canvas  = document.getElementById('avatar-canvas');
const ctx     = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const CX = W / 2, CY = H / 2 + 20;

// ── Emotion definitions ─────────────────────────────────────────
const EMOTIONS = {
  neutral:   { eyeH: 1.0, eyeSmile: 0.0, mouthCurve: 0,   cheek: 0,   browY: 0,   bodyTilt: 0  },
  happy:     { eyeH: 0.7, eyeSmile: 1.0, mouthCurve: 1.0,  cheek: 0.7, browY: 0.3, bodyTilt: 3  },
  excited:   { eyeH: 1.2, eyeSmile: 0.6, mouthCurve: 1.0,  cheek: 0.9, browY: 0.6, bodyTilt: 5  },
  shy:       { eyeH: 0.6, eyeSmile: 0.4, mouthCurve: 0.3,  cheek: 1.0, browY:-0.2, bodyTilt:-3  },
  sad:       { eyeH: 0.7, eyeSmile:-0.3, mouthCurve:-0.8,  cheek: 0,   browY:-0.5, bodyTilt:-2  },
  surprised: { eyeH: 1.5, eyeSmile: 0.0, mouthCurve: 0.0,  cheek: 0,   browY: 0.9, bodyTilt: 0  },
};

// ── Live state ──────────────────────────────────────────────────
let state = {
  // Interpolated display values
  eyeH: 1.0, eyeSmile: 0.0, mouthCurve: 0.0,
  cheek: 0.0, browY: 0.0, bodyTilt: 0.0,
  // Blink
  blinkT: 1.0,        // 1.0 = open, 0.0 = closed
  blinkPhase: 'open', // open | closing | opening
  nextBlink: 3000,
  blinkTimer: 0,
  // Breathing
  breathT: 0,
  // Mouth (lip sync)
  mouthOpen: 0,
  mouthTarget: 0,
  // Hair sway
  hairT: 0,
  // Speaking
  isSpeaking: false,
  lipTimer: 0,
};

// Target emotion (what we're lerping toward)
let targetEmotion = 'neutral';
let targetState   = { ...EMOTIONS.neutral };

// ── Public API ──────────────────────────────────────────────────
window.AvatarAPI = {
  setEmotion(name) {
    if (!EMOTIONS[name]) return;
    targetEmotion = name;
    targetState = { ...EMOTIONS[name] };
    document.getElementById('emotion-tag').textContent = EMOTION_ICONS[name] + ' ' + name;
  },
  startSpeaking() {
    state.isSpeaking = true;
  },
  stopSpeaking() {
    state.isSpeaking = false;
    state.mouthTarget = 0;
  },
};

const EMOTION_ICONS = {
  neutral: '😐', happy: '😊', excited: '🤩',
  shy: '😳', sad: '😢', surprised: '😲',
};

// ── Lerp helper ─────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Main render loop ─────────────────────────────────────────────
let lastTime = 0;

function tick(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(tick);
}

function update(dt) {
  const S = 1 - Math.pow(0.02, dt); // smooth lerp speed

  // Lerp toward target emotion
  state.eyeH       = lerp(state.eyeH,       targetState.eyeH,       S * 3);
  state.eyeSmile   = lerp(state.eyeSmile,   targetState.eyeSmile,   S * 3);
  state.mouthCurve = lerp(state.mouthCurve, targetState.mouthCurve, S * 4);
  state.cheek      = lerp(state.cheek,      targetState.cheek,      S * 2);
  state.browY      = lerp(state.browY,      targetState.browY,      S * 4);
  state.bodyTilt   = lerp(state.bodyTilt,   targetState.bodyTilt,   S * 2);

  // Blink
  state.blinkTimer += dt * 1000;
  if (state.blinkPhase === 'open' && state.blinkTimer > state.nextBlink) {
    state.blinkPhase = 'closing';
    state.blinkTimer = 0;
  }
  if (state.blinkPhase === 'closing') {
    state.blinkT -= dt * 10;
    if (state.blinkT <= 0) { state.blinkT = 0; state.blinkPhase = 'opening'; }
  }
  if (state.blinkPhase === 'opening') {
    state.blinkT += dt * 8;
    if (state.blinkT >= 1) {
      state.blinkT = 1;
      state.blinkPhase = 'open';
      state.blinkTimer = 0;
      state.nextBlink  = 2000 + Math.random() * 3000;
    }
  }

  // Breathing
  state.breathT += dt * 0.8;

  // Hair
  state.hairT += dt * 0.6;

  // Lip sync
  if (state.isSpeaking) {
    state.lipTimer += dt;
    if (state.lipTimer > 0.1) {
      state.mouthTarget = 0.2 + Math.random() * 0.6;
      state.lipTimer = 0;
    }
  } else {
    state.mouthTarget = 0;
  }
  state.mouthOpen = lerp(state.mouthOpen, state.mouthTarget, 1 - Math.pow(0.001, dt));
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  const breathY  = Math.sin(state.breathT * Math.PI * 2) * 3;
  const tilt     = (state.bodyTilt * Math.PI) / 180;
  const hairSway = Math.sin(state.hairT * Math.PI * 2) * 4;

  ctx.save();
  ctx.translate(CX, CY + breathY);
  ctx.rotate(tilt * 0.15);

  drawBody();
  drawNeck();
  drawHair(hairSway, 'back');
  drawFace();
  drawHair(hairSway, 'front');
  drawAccessories();

  ctx.restore();
}

// ── Drawing subroutines ──────────────────────────────────────────

function drawBody() {
  // Body / torso suggestion
  const grad = ctx.createLinearGradient(-70, 80, -70, 220);
  grad.addColorStop(0, '#2a1f4a');
  grad.addColorStop(1, '#1a1030');
  ctx.beginPath();
  ctx.moveTo(-65, 100);
  ctx.bezierCurveTo(-80, 150, -70, 220, -45, 230);
  ctx.lineTo(45, 230);
  ctx.bezierCurveTo(70, 220, 80, 150, 65, 100);
  ctx.fillStyle = grad;
  ctx.fill();

  // Collar detail
  ctx.beginPath();
  ctx.moveTo(-28, 105);
  ctx.lineTo(0, 120);
  ctx.lineTo(28, 105);
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawNeck() {
  ctx.beginPath();
  ctx.ellipse(0, 92, 18, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f3d9c8';
  ctx.fill();
}

function drawHair(sway, layer) {
  if (layer === 'back') {
    // Back hair
    ctx.beginPath();
    ctx.moveTo(-90, -60);
    ctx.bezierCurveTo(-100 + sway, 20, -85 + sway, 100, -60, 140);
    ctx.bezierCurveTo(-40, 160, 40, 160, 60, 140);
    ctx.bezierCurveTo(85 + sway, 100, 100 + sway, 20, 90, -60);
    ctx.bezierCurveTo(70, -90, -70, -90, -90, -60);
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();

    // Hair highlights
    ctx.beginPath();
    ctx.moveTo(-70, -80);
    ctx.bezierCurveTo(-60 + sway * 0.5, -30, -50 + sway * 0.5, 30, -40, 80);
    ctx.strokeStyle = 'rgba(167,139,250,0.15)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  if (layer === 'front') {
    // Bangs / fringe
    ctx.beginPath();
    ctx.moveTo(-85, -55);
    ctx.bezierCurveTo(-90 + sway * 0.3, -20, -65 + sway * 0.2, 10, -50, 5);
    ctx.bezierCurveTo(-40, 0, -30, -15, -20, -10);
    ctx.bezierCurveTo(-10, -5, -5, 10, 5, 5);
    ctx.bezierCurveTo(15, 0, 25, -15, 35, -8);
    ctx.bezierCurveTo(50, -2, 65 - sway * 0.2, 15, 75, 5);
    ctx.bezierCurveTo(90 - sway * 0.3, -5, 90, -30, 85, -55);
    ctx.closePath();
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();

    // Side ahoge (cute hair strand)
    const ahX = 60 + sway * 0.8;
    ctx.beginPath();
    ctx.moveTo(50, -60);
    ctx.bezierCurveTo(ahX, -100, ahX + 20, -110, ahX + 5, -85);
    ctx.strokeStyle = '#1a0a2e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function drawFace() {
  // Face base
  const faceGrad = ctx.createRadialGradient(-10, -20, 10, 0, 0, 90);
  faceGrad.addColorStop(0, '#fde8d8');
  faceGrad.addColorStop(1, '#f3d0b8');
  ctx.beginPath();
  ctx.ellipse(0, 0, 82, 94, 0, 0, Math.PI * 2);
  ctx.fillStyle = faceGrad;
  ctx.fill();

  // Cheeks
  if (state.cheek > 0.05) {
    ctx.globalAlpha = state.cheek * 0.55;
    ctx.beginPath();
    ctx.ellipse(-54, 22, 26, 14, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#f9a8d4';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(54, 22, 26, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawEyes();
  drawNose();
  drawMouth();
  drawEyebrows();
}

function drawEyes() {
  [-1, 1].forEach(side => {
    const ex = side * 34;
    const ey = -20;
    const eyeOpen = state.eyeH * state.blinkT;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, ey, 20, 18 * Math.max(0.05, eyeOpen), 0, 0, Math.PI * 2);
    ctx.clip();

    // Eye white
    ctx.beginPath();
    ctx.ellipse(ex, ey, 20, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Iris gradient
    const irisGrad = ctx.createRadialGradient(ex - 3, ey - 4, 2, ex, ey, 13);
    irisGrad.addColorStop(0, '#c4b5fd');
    irisGrad.addColorStop(0.5, '#7c3aed');
    irisGrad.addColorStop(1, '#1e0a3c');
    ctx.beginPath();
    ctx.arc(ex, ey + 2, 13, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(ex, ey + 3, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0520';
    ctx.fill();

    // Shine spots
    ctx.beginPath();
    ctx.arc(ex - 5, ey - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 4, ey + 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    ctx.restore();

    // Eye smile crease (shows when smiling)
    if (state.eyeSmile > 0.3) {
      ctx.globalAlpha = (state.eyeSmile - 0.3) / 0.7;
      ctx.beginPath();
      ctx.arc(ex, ey + 4, 18, Math.PI * 0.05, Math.PI * 0.95);
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Eyelash
    ctx.beginPath();
    ctx.ellipse(ex, ey - 16 * Math.max(0.05, eyeOpen), 20, 4, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();
  });
}

function drawEyebrows() {
  [-1, 1].forEach(side => {
    const bx = side * 34;
    const by = -52 - state.browY * 10;
    ctx.beginPath();
    ctx.moveTo(bx - 18, by + side * 2);
    ctx.quadraticCurveTo(bx, by - 4, bx + 18, by + side * 2);
    ctx.strokeStyle = '#1a0a2e';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  });
}

function drawNose() {
  ctx.beginPath();
  ctx.ellipse(0, 14, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(200,150,130,0.4)';
  ctx.fill();
}

function drawMouth() {
  const curve = state.mouthCurve * 16;
  const open  = state.mouthOpen * 14;

  if (open > 1) {
    // Open mouth (lip sync)
    ctx.beginPath();
    ctx.moveTo(-22, 44);
    ctx.quadraticCurveTo(0, 44 + curve + open, 22, 44);
    ctx.quadraticCurveTo(0, 44 + curve, -22, 44);
    ctx.closePath();
    ctx.fillStyle = '#1a0520';
    ctx.fill();
    // Upper lip
    ctx.beginPath();
    ctx.moveTo(-22, 44);
    ctx.quadraticCurveTo(0, 44 + curve, 22, 44);
    ctx.strokeStyle = '#c06080';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  } else {
    // Closed mouth
    ctx.beginPath();
    ctx.moveTo(-22, 44);
    ctx.quadraticCurveTo(0, 44 + curve, 22, 44);
    ctx.strokeStyle = '#c06080';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function drawAccessories() {
  // Star hair clip
  drawStar(42, -62, 7, '#f472b6');
  // Ear studs
  ctx.beginPath();
  ctx.arc(-83, 8, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#a78bfa';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(83, 8, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const b = (i * 4 * Math.PI) / 5 + (2 * Math.PI) / 5 - Math.PI / 2;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(b) * (r * 0.4), Math.sin(b) * (r * 0.4));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ── Start ────────────────────────────────────────────────────────
requestAnimationFrame(tick);
