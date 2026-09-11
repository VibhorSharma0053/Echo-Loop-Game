/**
 * AudioManager — all game sound, generated procedurally with the native Web
 * Audio API.
 *
 * ZERO ASSETS BY DESIGN: every sound is synthesised from OscillatorNodes at
 * runtime. Nothing is downloaded, nothing is licensed, nothing needs
 * attribution, and the bundle grows by zero bytes. No third-party audio
 * library is used.
 *
 * ROBUSTNESS: browsers forbid starting an AudioContext before a user gesture,
 * and some environments (headless tests, locked-down browsers) have no Web
 * Audio at all. So the context is created lazily on the first gesture, and
 * EVERY public method is a safe no-op when audio is unavailable — sound can
 * never break gameplay.
 *
 * MIXING: two buses hang off the master gain — `sfx` for one-shots and `pad`
 * for the ambient bed — so the ambient layer can be faded independently and
 * kept far below the effects.
 *
 * Signal graph:
 *   osc/LFO -> voice gain -> (sfxBus | padBus) -> master -> destination
 */

/** Equal-tempered note frequencies used by the cues (A4 = 440). */
const NOTE = {
  A2: 110.0,
  E3: 164.81,
  A3: 220.0,
  C4: 261.63,
  E4: 329.63,
  A4: 440.0,
  CS5: 554.37,
  E5: 659.25,
  A5: 880.0,
  CS6: 1108.73,
};

/** Minimum seconds between retriggers of the same cue (anti-spam). */
const THROTTLE = {
  jump: 0.05,
  switchOn: 0.08,
  loopReset: 0.25,
  solved: 0.5,
};

/** Master ceiling; individual cues sit well below this. */
const MASTER_CEILING = 0.9;
/** The ambient bed is deliberately far quieter than the effects. */
const PAD_LEVEL = 0.05;

export class AudioManager {
  /**
   * @param {{muted?: boolean, volume?: number}} [options]
   */
  constructor({ muted = false, volume = 0.7 } = {}) {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.padBus = null;

    this.muted = muted === true;
    this.volume = Math.max(0, Math.min(1, volume));

    /** Whether the ambient bed should be sounding right now. */
    this.ambientWanted = false;
    /** @type {{oscs: OscillatorNode[], lfo: OscillatorNode}|null} */
    this._pad = null;

    this.menuMusic = typeof Audio !== "undefined" ? new Audio('/audio/menu-music.mp3') : null;
    if (this.menuMusic) this.menuMusic.loop = true;
    
    this.actionMusic = typeof Audio !== "undefined" ? new Audio('/audio/action-music.mp3') : null;
    if (this.actionMusic) this.actionMusic.loop = true;
    
    this._updateMusicVolume();

    /** Last start time per cue, for throttling. @type {Map<string, number>} */
    this._lastAt = new Map();

    this._unlockHandler = () => this.unlock();
    this._visibilityHandler = () => this._onVisibilityChange();
    this._attached = false;
  }

  /** True when a real audio context exists and is running. */
  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Listen for the first user gesture so the context can be created legally.
   * Safe to call once at boot, before any gesture has happened.
   */
  attach() {
    if (this._attached || typeof window === "undefined") return;
    this._attached = true;
    const opts = { passive: true };
    window.addEventListener("pointerdown", this._unlockHandler, opts);
    window.addEventListener("keydown", this._unlockHandler, opts);
    window.addEventListener("touchstart", this._unlockHandler, opts);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }
  }

  /**
   * Create/resume the AudioContext. Called on the first user gesture; further
   * calls are cheap no-ops.
   */
  unlock() {
    if (!this.ctx) {
      const Ctor =
        typeof window !== "undefined" &&
        (window.AudioContext || window.webkitAudioContext);
      if (!Ctor) return; // no Web Audio here — stay silent, never throw
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
      this._buildGraph();
    }
    if (this.ctx.state === "suspended") {
      // Returns a promise in modern browsers; failure is non-fatal.
      try {
        this.ctx.resume?.();
      } catch {
        /* ignore */
      }
    }
    // The gesture that unlocked us may have happened mid-level.
    if (this.ambientWanted) this._startPad();
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * MASTER_CEILING;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0; // faded in when the pad starts
    this.padBus.connect(this.master);
  }

  /** Suspend audio while the tab is hidden; resume when it comes back. */
  _onVisibilityChange() {
    if (!this.ctx || typeof document === "undefined") return;
    try {
      if (document.hidden) this.ctx.suspend?.();
      else if (!this.muted) this.ctx.resume?.();
    } catch {
      /* ignore */
    }
  }

  // --- mute / volume --------------------------------------------------------

  /** @param {boolean} muted */
  setMuted(muted) {
    this.muted = muted === true;
    this._applyMasterGain();
    this._updateMusicVolume();
    return this.muted;
  }

  /** @returns {boolean} the new muted state */
  toggleMute() {
    return this.setMuted(!this.muted);
  }

  /** @param {number} volume 0..1 */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this._applyMasterGain();
    this._updateMusicVolume();
    return this.volume;
  }

  _applyMasterGain() {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume * MASTER_CEILING;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    // Short ramp instead of a jump, so muting doesn't click.
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + 0.05);
  }

  // --- low-level helpers ----------------------------------------------------

  /** Should this cue be skipped (no audio, muted, or retriggered too fast)? */
  _blocked(name, throttle) {
    if (!this.ready || this.muted) return true;
    const now = this.ctx.currentTime;
    const last = this._lastAt.get(name);
    if (last !== undefined && now - last < throttle) return true;
    this._lastAt.set(name, now);
    return false;
  }

  /**
   * Schedule one enveloped oscillator voice.
   *
   * @param {object} spec
   * @param {number} spec.freq starting frequency
   * @param {number} [spec.toFreq] optional glide target
   * @param {OscillatorType} [spec.type]
   * @param {number} [spec.at] start offset in seconds from now
   * @param {number} [spec.attack]
   * @param {number} [spec.decay]
   * @param {number} [spec.peak] peak gain for this voice
   */
  _voice({
    freq,
    toFreq = null,
    type = "sine",
    at = 0,
    attack = 0.008,
    decay = 0.12,
    peak = 0.2,
  }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (toFreq !== null) {
      // Exponential glide reads as a musical "sweep" rather than a slide.
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, toFreq),
        t0 + attack + decay,
      );
    }

    // Exponential ramps cannot touch zero, hence the tiny floor values.
    const g = gain.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.03);
    // Let the nodes be collected once they've finished sounding.
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    return osc;
  }

  // --- cues -----------------------------------------------------------------

  /**
   * Jump: a short rising blip. Echo jumps pass a lower scale so the ghosts
   * stay audibly secondary to the live player.
   * @param {number} [scale] volume multiplier
   */
  jump(scale = 1) {
    if (this._blocked("jump", THROTTLE.jump)) return;
    this._voice({
      freq: 220,
      toFreq: 440,
      type: "sine",
      attack: 0.006,
      decay: 0.11,
      peak: 0.16 * scale,
    });
  }

  /** Switch activated: a bright two-note chime. */
  switchOn() {
    if (this._blocked("switchOn", THROTTLE.switchOn)) return;
    this._voice({ freq: NOTE.A5, type: "triangle", at: 0, attack: 0.004, decay: 0.07, peak: 0.11 });
    this._voice({ freq: NOTE.CS6, type: "triangle", at: 0.06, attack: 0.004, decay: 0.1, peak: 0.09 });
  }

  /**
   * Loop reset: a warm minor arpeggio (~400ms).
   *
   * This fires on EVERY loop reset, several times per level, so it is tuned
   * to feel rhythmic and encouraging rather than like a failure buzzer: soft
   * triangle waves, gentle attack, notes rolled rather than struck together.
   */
  loopReset() {
    if (this._blocked("loopReset", THROTTLE.loopReset)) return;
    const notes = [NOTE.A3, NOTE.C4, NOTE.E4];
    notes.forEach((freq, i) => {
      this._voice({
        freq,
        type: "triangle",
        at: i * 0.075,
        attack: 0.02,
        decay: 0.3,
        peak: 0.085,
      });
    });
  }

  /** Level solved: a triumphant ascending major arpeggio. */
  solved() {
    if (this._blocked("solved", THROTTLE.solved)) return;
    const notes = [NOTE.A4, NOTE.CS5, NOTE.E5, NOTE.A5];
    notes.forEach((freq, i) => {
      this._voice({
        freq,
        type: "triangle",
        at: i * 0.1,
        attack: 0.01,
        decay: i === notes.length - 1 ? 0.42 : 0.18,
        peak: 0.12,
      });
    });
  }

  // --- custom music controls ------------------------------------------------
  
  _updateMusicVolume() {
    const vol = this.muted ? 0 : this.volume * 0.5;
    if (this.menuMusic) this.menuMusic.volume = vol;
    if (this.actionMusic) this.actionMusic.volume = vol;
  }

  playMenuMusic() {
    if (!this.menuMusic) return;
    if (this.actionMusic) {
      this.actionMusic.pause();
      this.actionMusic.currentTime = 0;
    }
    this.menuMusic.play().catch(() => {}); 
  }

  playActionMusic() {
    if (!this.actionMusic) return;
    if (this.menuMusic) this.menuMusic.pause();
    this.actionMusic.play().catch(() => {});
  }

  stopAllMusic() {
    if (this.menuMusic) this.menuMusic.pause();
    if (this.actionMusic) {
      this.actionMusic.pause();
      this.actionMusic.currentTime = 0;
    }
  }

  // --- ambient bed ----------------------------------------------------------

  /** Begin the ambient pad (idempotent). */
  startAmbient() {
    this.ambientWanted = true;
    this._startPad();
  }

  /** Fade the ambient pad out and tear it down (idempotent). */
  stopAmbient() {
    this.ambientWanted = false;
    if (!this.ctx || !this._pad) return;
    const now = this.ctx.currentTime;
    const g = this.padBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.6);

    const pad = this._pad;
    this._pad = null;
    const stopAt = now + 0.7;
    for (const osc of pad.oscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      pad.lfo.stop(stopAt);
    } catch {
      /* ignore */
    }
  }

  /**
   * Two detuned sines plus a quiet fifth, low-passed, with a very slow LFO
   * breathing the level up and down: "ambient, minimal, slightly melancholic"
   * (an A-minor-ish drone), sitting far below the sound effects.
   */
  _startPad() {
    if (!this.ready || this._pad) return;
    const ctx = this.ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700; // shave the harshness off the triangle edges
    filter.Q.value = 0.4;
    filter.connect(this.padBus);

    const voices = [
      { freq: NOTE.A2, detune: -4, type: "sine", gain: 0.6 },
      { freq: NOTE.A2, detune: +5, type: "sine", gain: 0.6 }, // detuned twin = slow beating
      { freq: NOTE.E3, detune: 0, type: "sine", gain: 0.32 }, // open fifth
      { freq: NOTE.C4, detune: +3, type: "triangle", gain: 0.12 }, // minor third, barely there
    ];

    const oscs = [];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = v.type;
      osc.frequency.value = v.freq;
      osc.detune.value = v.detune;
      gain.gain.value = v.gain;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      oscs.push(osc);
    }

    // Slow amplitude drift so the bed evolves instead of droning flatly.
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.05; // one breath per ~20 seconds
    lfoDepth.gain.value = PAD_LEVEL * 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.padBus.gain);
    lfo.start();

    // Fade in from silence to the (LFO-modulated) resting level.
    const now = ctx.currentTime;
    const g = this.padBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(PAD_LEVEL, now + 1.5);

    this._pad = { oscs, lfo };
  }

  /** Release everything (not used in-game; handy for teardown/tests). */
  dispose() {
    this.stopAmbient();
    if (typeof window !== "undefined" && this._attached) {
      window.removeEventListener("pointerdown", this._unlockHandler);
      window.removeEventListener("keydown", this._unlockHandler);
      window.removeEventListener("touchstart", this._unlockHandler);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", this._visibilityHandler);
      }
      this._attached = false;
    }
    try {
      this.ctx?.close?.();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

export default AudioManager;
