/**
 * HUD — all on-screen UI, drawn on top of the world every frame.
 *
 * Owns three things:
 *   1. a circular loop timer at top-center that depletes clockwise,
 *   2. a row of echo dots (filled = banked echo, hollow = unused slot),
 *   3. the rewind flash that fires on every loop reset.
 *
 * The HUD is purely presentational: it reads a snapshot of game state and
 * never mutates it, so it can never affect the deterministic simulation.
 * Its animations are driven by real frame time (seconds), NOT by simulation
 * ticks — a visual fade should look identical regardless of how many fixed
 * steps happened to run this frame.
 */
import { echoColor, UI } from "./palette.js";
import { FIXED_DT } from "../game/GameLoop.js";

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2; // 12 o'clock, where the timer starts and ends

/**
 * Rewind flash duration in seconds (inside the 150-250ms target).
 *
 * The three reset signals are deliberately staggered so they read as one
 * event with a tail rather than three things happening at once:
 *   0.00s  flash peaks + loop-reset arpeggio's first note + new echo starts
 *          fading in (ECHO_FADE_SECONDS = 0.2s in main.js)
 *   0.22s  flash is gone; the echo has finished fading in
 *   0.45s  the timer ring's snap-back pulse settles
 *   0.47s  the arpeggio's last note finishes ringing
 */
export const FLASH_DURATION = 0.22;

/** Decay rate of the timer-ring pulse: 1/2.2 ≈ 0.45s, matching the arpeggio. */
const RESET_PULSE_DECAY = 2.2;

export class HUD {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} viewport logical canvas size
   */
  constructor(ctx, { width, height }) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Timer geometry (top-center).
    this.cx = width / 2;
    this.cy = 52;
    this.radius = 26;

    /** Seconds left on the current flash; 0 = no flash. */
    this.flashTimer = 0;
    /** Color the current flash fades from. */
    this.flashColor = UI.accent;

    /** Eased pulse (0..1) used to punch the timer ring right after a reset. */
    this._resetPulse = 0;
  }

  /**
   * Fire the rewind flash. Called on every loop reset — natural timeout and
   * quick-restart alike — so a reset is always legible even if the player
   * was looking at the far side of the level.
   * @param {string} [color]
   */
  triggerFlash(color = UI.accent) {
    this.flashTimer = FLASH_DURATION;
    this.flashColor = color;
    this._resetPulse = 1;
  }

  /**
   * Advance HUD animations.
   * @param {number} frameDt real seconds elapsed since the last frame
   */
  update(frameDt) {
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - frameDt);
    }
    if (this._resetPulse > 0) {
      this._resetPulse = Math.max(0, this._resetPulse - frameDt * RESET_PULSE_DECAY);
    }
  }

  /**
   * Draw the flash overlay. Called BEFORE the HUD widgets so the flash washes
   * over the world but never hides the timer.
   */
  drawFlash() {
    if (this.flashTimer <= 0) return;
    const ctx = this.ctx;

    // Ease-out: bright immediately, then a quick tail. Peaks well below 1 so
    // the screen never fully whites out.
    const t = this.flashTimer / FLASH_DURATION;
    const alpha = t * t * 0.55;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Radial wash centered on the loop timer, brightest at the middle.
    const gradient = ctx.createRadialGradient(
      this.cx,
      this.height / 2,
      0,
      this.cx,
      this.height / 2,
      Math.max(this.width, this.height) * 0.75,
    );
    gradient.addColorStop(0, this.flashColor);
    gradient.addColorStop(0.55, this.flashColor);
    gradient.addColorStop(1, "rgba(10, 15, 26, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // A couple of scan bands sliding outward sell the "rewind" read.
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = this.flashColor;
    const spread = (1 - t) * this.height * 0.6;
    ctx.fillRect(0, this.height / 2 - spread - 2, this.width, 2);
    ctx.fillRect(0, this.height / 2 + spread, this.width, 2);

    ctx.restore();
  }

  /**
   * Draw the HUD widgets.
   *
   * @param {object} snapshot
   * @param {number} snapshot.currentTick
   * @param {number} snapshot.loopDurationTicks
   * @param {number} snapshot.echoCount banked echoes
   * @param {number} snapshot.maxEchoes echo budget
   * @param {string} [snapshot.levelId]
   * @param {boolean} [snapshot.solved]
   */
  draw({
    currentTick,
    loopDurationTicks,
    echoCount,
    maxEchoes,
    levelId = "",
    solved = false,
    muted = false,
  }) {
    const remaining = solved
      ? 1
      : Math.max(0, 1 - currentTick / loopDurationTicks);
    // Ticks -> seconds via the simulation's fixed rate, so the countdown text
    // always agrees with the ring.
    const secondsLeft = Math.ceil(remaining * loopDurationTicks * FIXED_DT);
    this._drawLoopTimer(remaining, solved, secondsLeft);
    this._drawEchoDots(echoCount, maxEchoes);
    if (levelId) this._drawLevelTag(levelId, solved);
    this._drawSoundIcon(muted);
  }

  /** Speaker glyph in the top-right; also the clickable mute hit-area. */
  get soundIconRect() {
    return { x: this.width - 40, y: 16, w: 24, h: 22 };
  }

  /** @param {boolean} muted */
  _drawSoundIcon(muted) {
    const ctx = this.ctx;
    const r = this.soundIconRect;
    const cx = r.x + 6;
    const cy = r.y + r.h / 2;
    const color = muted ? "rgba(148, 163, 184, 0.5)" : UI.accent;

    ctx.save();
    // Speaker body: a small square plus a triangular cone.
    ctx.fillStyle = color;
    ctx.fillRect(cx - 5, cy - 3, 4, 6);
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 3);
    ctx.lineTo(cx + 4, cy - 8);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.lineTo(cx - 1, cy + 3);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    if (muted) {
      // Slash through the speaker.
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 6);
      ctx.lineTo(cx + 17, cy + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 17, cy - 6);
      ctx.lineTo(cx + 8, cy + 6);
      ctx.stroke();
    } else {
      // Two radiating arcs.
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 7, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 11, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Circular timer: a full ring that empties clockwise as the loop runs out.
   * @param {number} remaining 0..1
   * @param {boolean} solved
   */
  _drawLoopTimer(remaining, solved, secondsLeft) {
    const ctx = this.ctx;
    const { cx, cy, radius } = this;
    // Pulse briefly on reset so the ring "snaps" back to full.
    const r = radius + this._resetPulse * 3;

    const urgent = !solved && remaining <= 0.25;
    const color = solved ? UI.good : urgent ? UI.warn : UI.accent;

    ctx.save();

    // Dark disc so the timer stays readable over bright level geometry.
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, TAU);
    ctx.fillStyle = "rgba(4, 6, 11, 0.55)";
    ctx.fill();

    // Track (the full circle outline).
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.lineWidth = 5;
    ctx.strokeStyle = UI.track;
    ctx.stroke();

    // Remaining time: an arc from 12 o'clock that shrinks clockwise.
    if (remaining > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, TOP, TOP + TAU * remaining, false);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      // Urgency glow in the last quarter of the loop.
      ctx.shadowColor = color;
      ctx.shadowBlur = urgent ? 14 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Seconds remaining, centered in the ring.
    ctx.fillStyle = solved ? UI.good : urgent ? UI.warn : UI.text;
    ctx.font =
      "600 15px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(solved ? "✓" : String(secondsLeft), cx, cy + 1);

    ctx.restore();
  }

  /**
   * Echo dots: one filled dot per banked echo in that echo's world color,
   * plus hollow outline dots for the unused slots.
   */
  _drawEchoDots(echoCount, maxEchoes) {
    const ctx = this.ctx;
    const radius = 5;
    const gap = 16;
    const totalWidth = (maxEchoes - 1) * gap;
    const startX = this.cx - totalWidth / 2;
    const y = this.cy + this.radius + 20;

    ctx.save();
    for (let i = 0; i < maxEchoes; i += 1) {
      const x = startX + i * gap;
      const filled = i < echoCount;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      if (filled) {
        const color = echoColor(i).solid;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Unused slot: faded outline only.
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = UI.slotEmpty;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Small level id above the timer. */
  _drawLevelTag(levelId, solved) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "600 10px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = solved ? UI.good : UI.textDim;
    ctx.letterSpacing = "2px";
    ctx.fillText(solved ? "SOLVED" : levelId.toUpperCase(), this.cx, 16);
    ctx.restore();
  }
}

export default HUD;
