/**
 * emotionParser.js — Maps LLM emotion tags to Live2D parameter objects
 *
 * Live2D Cubism uses named float parameters (0.0–1.0 or -1.0–1.0 depending on setup).
 * Common standard parameter IDs (from the official Cubism SDK spec):
 *
 *   ParamAngleX       — head yaw  (-30 to 30)
 *   ParamAngleY       — head pitch (-30 to 30)
 *   ParamAngleZ       — head roll (-30 to 30)
 *   ParamEyeOpenL/R   — eye open amount (0 to 1)
 *   ParamEyeSmile     — eye smile (0 to 1)
 *   ParamBrowLY/RY    — brow vertical position (-1 to 1)
 *   ParamBrowFrownL/R — brow frown (0 to 1)
 *   ParamMouthOpenY   — mouth open amount (0 to 1)
 *   ParamMouthForm    — mouth shape (-1 = sad, 0 = neutral, 1 = happy)
 *   ParamCheek        — blush / cheek redness (0 to 1)
 *   ParamBodyAngleX   — body lean
 *
 * The `intensity` value (0.0–1.0) from the LLM scales all parameter targets
 * proportionally, allowing subtle vs. strong expressions of the same emotion.
 *
 * How these are used on the frontend:
 *   emotionController.js receives { type: "expression", params: {...} } via WebSocket
 *   and smoothly interpolates current Live2D parameter values toward these targets
 *   using requestAnimationFrame lerp.
 */

// Base parameter state — resting / neutral face
const NEUTRAL = {
  ParamEyeOpenL: 1.0,
  ParamEyeOpenR: 1.0,
  ParamEyeSmile: 0.0,
  ParamBrowLY: 0.0,
  ParamBrowRY: 0.0,
  ParamBrowFrownL: 0.0,
  ParamBrowFrownR: 0.0,
  ParamMouthOpenY: 0.0,
  ParamMouthForm: 0.0,
  ParamCheek: 0.0,
  ParamAngleX: 0.0,
  ParamAngleY: 0.0,
  ParamAngleZ: 0.0,
  ParamBodyAngleX: 0.0,
};

// Emotion target parameter sets (at full intensity = 1.0)
const EMOTION_MAP = {
  neutral: {
    ...NEUTRAL,
  },

  happy: {
    ParamEyeSmile: 1.0,
    ParamMouthForm: 1.0,
    ParamMouthOpenY: 0.3,
    ParamCheek: 0.2,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamAngleY: 5.0,       // slight head tilt up — positive energy
    ParamBodyAngleX: 3.0,
  },

  excited: {
    ParamEyeSmile: 0.8,
    ParamEyeOpenL: 1.2,     // wide open + smile
    ParamEyeOpenR: 1.2,
    ParamMouthForm: 1.0,
    ParamMouthOpenY: 0.6,
    ParamCheek: 0.4,
    ParamBrowLY: 0.5,
    ParamBrowRY: 0.5,
    ParamAngleY: 10.0,
    ParamAngleZ: -5.0,      // slight head tilt
    ParamBodyAngleX: 5.0,
  },

  shy: {
    ParamEyeSmile: 0.5,
    ParamEyeOpenL: 0.7,     // slightly downcast
    ParamEyeOpenR: 0.7,
    ParamCheek: 1.0,        // max blush
    ParamMouthForm: 0.3,
    ParamBrowLY: -0.2,
    ParamBrowRY: -0.2,
    ParamAngleX: -5.0,      // look slightly away
    ParamAngleY: -3.0,      // look slightly down
    ParamAngleZ: 5.0,
  },

  sad: {
    ParamEyeOpenL: 0.6,
    ParamEyeOpenR: 0.6,
    ParamEyeSmile: -0.3,
    ParamMouthForm: -1.0,   // sad mouth
    ParamBrowFrownL: 0.7,
    ParamBrowFrownR: 0.7,
    ParamBrowLY: -0.4,
    ParamBrowRY: -0.4,
    ParamAngleY: -8.0,      // looking down
    ParamBodyAngleX: -3.0,
  },

  surprised: {
    ParamEyeOpenL: 1.5,     // wide eyes
    ParamEyeOpenR: 1.5,
    ParamEyeSmile: 0.0,
    ParamMouthOpenY: 0.7,   // mouth open
    ParamMouthForm: 0.0,
    ParamBrowLY: 0.8,       // brows raised high
    ParamBrowRY: 0.8,
    ParamAngleY: 5.0,
    ParamBodyAngleX: -5.0,  // slight lean back
  },

  focused: {
    ParamEyeOpenL: 0.9,
    ParamEyeOpenR: 0.9,
    ParamEyeSmile: 0.1,
    ParamMouthForm: 0.0,
    ParamBrowLY: 0.1,
    ParamBrowRY: 0.1,
    ParamBrowFrownL: 0.2,
    ParamBrowFrownR: 0.2,
    ParamAngleX: 3.0,       // slight forward lean
    ParamAngleY: -2.0,
  },

  playful: {
    ParamEyeSmile: 0.6,
    ParamEyeOpenL: 0.9,
    ParamEyeOpenR: 1.1,     // one eye slightly more open — asymmetric, cheeky
    ParamMouthForm: 0.8,
    ParamMouthOpenY: 0.2,
    ParamCheek: 0.1,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.5,       // one brow raised — "really?"
    ParamAngleZ: 8.0,       // playful head tilt
    ParamBodyAngleX: 4.0,
  },
};

/**
 * emotionToLive2DParams — returns a merged parameter object for the given emotion
 *
 * Merges NEUTRAL base (so all params are always present) with the emotion target,
 * then scales all non-neutral deltas by `intensity`.
 *
 * @param {string} emotion    — must be a key in EMOTION_MAP
 * @param {number} intensity  — 0.0 to 1.0
 * @returns {Record<string, number>}
 */
export function emotionToLive2DParams(emotion, intensity = 0.7) {
  const target = EMOTION_MAP[emotion] ?? EMOTION_MAP.neutral;
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  // Build final params: lerp between NEUTRAL and target by intensity
  const result = {};
  const allKeys = new Set([...Object.keys(NEUTRAL), ...Object.keys(target)]);

  for (const key of allKeys) {
    const neutralVal = NEUTRAL[key] ?? 0;
    const targetVal = target[key] ?? neutralVal;
    // Linear interpolation: neutral + (target - neutral) * intensity
    result[key] = neutralVal + (targetVal - neutralVal) * clampedIntensity;
  }

  return result;
}
