/**
 * voice.js — Web Speech API TTS for Oshi
 *
 * Exposes window.VoiceAPI.speak(text, onComplete)
 * No API keys required — uses browser SpeechSynthesis.
 */

(function () {
  'use strict';

  const synth = window.speechSynthesis;

  let muted = false;
  let currentUtterance = null;

  // ── Voice selection ─────────────────────────────────────────────
  function pickVoice() {
    const voices = synth.getVoices();
    // Prefer a female English voice
    const preferred = voices.find(v =>
      /female|zira|hazel|karen|samantha|victoria|moira/i.test(v.name) &&
      v.lang.startsWith('en')
    );
    return preferred || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  }

  // Voices may load asynchronously on first call
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => {}; // trigger load
  }

  // ── Core speak function ─────────────────────────────────────────
  /**
   * Speak text aloud. Calls onComplete when finished (or immediately if muted).
   * @param {string} text
   * @param {() => void} onComplete
   * @returns {Promise<void>}
   */
  function speak(text, onComplete) {
    return new Promise(resolve => {
      const done = () => {
        if (window.AvatarAPI) window.AvatarAPI.stopSpeaking();
        if (typeof onComplete === 'function') onComplete();
        resolve();
      };

      // Cancel any in-progress speech
      if (synth.speaking) {
        synth.cancel();
      }

      if (muted || !text) {
        done();
        return;
      }

      const utter = new SpeechSynthesisUtterance(text);
      currentUtterance = utter;

      utter.voice = pickVoice();
      utter.rate  = 1.05;   // slightly faster = more energetic
      utter.pitch = 1.2;    // higher pitch = anime-ish
      utter.volume = 1.0;

      utter.onstart = () => {
        if (window.AvatarAPI) window.AvatarAPI.startSpeaking();
      };

      utter.onend = () => {
        currentUtterance = null;
        done();
      };

      utter.onerror = (e) => {
        // 'interrupted' fires when we cancel — not a real error
        if (e.error !== 'interrupted') {
          console.warn('SpeechSynthesis error:', e.error);
        }
        currentUtterance = null;
        done();
      };

      synth.speak(utter);
    });
  }

  // ── Stop / cancel ───────────────────────────────────────────────
  function stop() {
    if (synth.speaking) synth.cancel();
    if (window.AvatarAPI) window.AvatarAPI.stopSpeaking();
    currentUtterance = null;
  }

  // ── Mute toggle ─────────────────────────────────────────────────
  const voiceBtn = document.getElementById('voice-btn');

  function toggleMute() {
    muted = !muted;
    if (muted && synth.speaking) synth.cancel();
    if (voiceBtn) {
      voiceBtn.textContent = muted ? '🔇 Muted' : '🔊 Voice';
      voiceBtn.classList.toggle('muted', muted);
    }
  }

  if (voiceBtn) {
    voiceBtn.addEventListener('click', toggleMute);
  }

  // ── Public API ──────────────────────────────────────────────────
  window.VoiceAPI = { speak, stop, toggleMute, isMuted: () => muted };
})();
