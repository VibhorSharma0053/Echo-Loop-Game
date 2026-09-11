/**
 * VisualState — purely decorative, render-layer animation state.
 *
 * THE HARD RULE: nothing in this file may ever be read by the simulation.
 * It only ever *observes* game state (a door's `open` boolean, a plate's
 * `pressed` boolean, the player's `grounded`/`vy`) and smooths it for
 * drawing. The fixed-timestep physics and echo replay are completely
 * untouched, so collision still flips at exactly the same tick it always did
 * — only the pixels lag behind it.
 *
 * Everything here advances on REAL FRAME TIME (or wall clock, for ambient
 * effects like the portal swirl), never on simulation ticks, so a slow or
 * fast machine changes nothing about determinism.
 *
 * Landing/takeoff detection is done by *comparing frames* rather than by
 * reading the per-tick `jumpedThisTick` flag: several physics ticks can run
 * between two rendered frames, so a tick-scoped flag would be missed. Edge
 * detection on the rendered state is both robust and read-only.
 */

/** Seconds for a door panel to slide open/shut (visual only). */
const DOOR_SLIDE_SECONDS = 0.26;
/** Seconds for a plate to sink / pop back up. */
const PLATE_PRESS_SECONDS = 0.08;
/** Seconds a squash or stretch takes to relax back to normal. */
const SQUASH_SECONDS = 0.14;
/** Fall speed (px/s) that produces a full-strength landing squash. */
const FULL_IMPACT_VY = 700;
/** Portal motes. Kept low deliberately — see the performance note in README. */
const PARTICLE_COUNT = 6;

/** Move `current` toward `target` by at most `maxDelta`. */
function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

export class VisualState {
  constructor() {
    /** doorId -> 0 (shut) .. 1 (fully open). @type {Map<string, number>} */
    this.doorOpen = new Map();
    /** switchId -> 0 (up) .. 1 (fully depressed). @type {Map<string, number>} */
    this.platePress = new Map();

    /** Player facing: 1 = right, -1 = left. Cosmetic only. */
    this.facing = 1;
    /** -1 .. +1; positive = stretched tall (takeoff), negative = squashed. */
    this.squash = 0;
    /** Seconds left on the current squash/stretch pose. */
    this.squashTimer = 0;

    /** Previous-frame observations, for edge detection. */
    this._wasGrounded = true;
    this._lastVy = 0;

    /** @type {Array<{x:number,y:number,vy:number,life:number,ttl:number,r:number}>} */
    this.particles = [];

    /** Seconds since this level was opened; drives ambient animation. */
    this.time = 0;
  }

  /** Forget everything (called when a level is loaded or restarted). */
  reset() {
    this.doorOpen.clear();
    this.platePress.clear();
    this.facing = 1;
    this.squash = 0;
    this.squashTimer = 0;
    this._wasGrounded = true;
    this._lastVy = 0;
    this.particles = [];
    this.time = 0;
  }

  /**
   * Advance all decorative animation.
   *
   * @param {number} frameDt real seconds since the previous frame
   * @param {{level: object, player: object}} session
   */
  update(frameDt, session) {
    if (!session) return;
    const dt = Math.min(frameDt, 0.05); // clamp after a tab-switch stall
    this.time += dt;

    const { level, player } = session;

    // --- doors: ease the panel toward the logical open/closed state --------
    for (const door of level.doors) {
      const target = door.open ? 1 : 0;
      const current = this.doorOpen.get(door.id) ?? target; // snap on first sight
      this.doorOpen.set(
        door.id,
        approach(current, target, dt / DOOR_SLIDE_SECONDS),
      );
    }

    // --- plates: sink and pop ----------------------------------------------
    for (const sw of level.switches) {
      const target = sw.pressed ? 1 : 0;
      const current = this.platePress.get(sw.id) ?? target;
      this.platePress.set(
        sw.id,
        approach(current, target, dt / PLATE_PRESS_SECONDS),
      );
    }

    // --- player: facing + squash/stretch -----------------------------------
    if (player.vx > 12) this.facing = 1;
    else if (player.vx < -12) this.facing = -1;

    const grounded = player.grounded === true;
    if (this._wasGrounded && !grounded && player.vy < 0) {
      // Took off: stretch tall.
      this.squash = 1;
      this.squashTimer = SQUASH_SECONDS;
    } else if (!this._wasGrounded && grounded) {
      // Landed: squash wide, harder the faster the fall was.
      const impact = Math.min(1, Math.abs(this._lastVy) / FULL_IMPACT_VY);
      if (impact > 0.15) {
        this.squash = -impact;
        this.squashTimer = SQUASH_SECONDS;
      }
    }
    this._wasGrounded = grounded;
    this._lastVy = player.vy;

    if (this.squashTimer > 0) {
      this.squashTimer = Math.max(0, this.squashTimer - dt);
      if (this.squashTimer === 0) this.squash = 0;
    }

    this._updateParticles(dt, level.goal);
  }

  /**
   * The player's render-only scale. Bottom-centre anchored by the caller, so
   * the feet stay planted. NEVER applied to the collision box.
   * @returns {{sx:number, sy:number}}
   */
  get playerScale() {
    if (this.squashTimer <= 0 || this.squash === 0) return { sx: 1, sy: 1 };
    // Ease out, so the pose snaps in and relaxes smoothly.
    const k = (this.squashTimer / SQUASH_SECONDS) ** 1.6 * this.squash;
    // Volume-preserving-ish: widen as it flattens and vice versa.
    return { sx: 1 - k * 0.26, sy: 1 + k * 0.3 };
  }

  /** Small drifting motes rising out of the goal portal. */
  _updateParticles(dt, goal) {
    if (!goal) return;
    while (this.particles.length < PARTICLE_COUNT) {
      this.particles.push(this._spawnParticle(goal, Math.random()));
    }
    for (const p of this.particles) {
      p.life += dt;
      p.y += p.vy * dt;
      if (p.life >= p.ttl) Object.assign(p, this._spawnParticle(goal, 0));
    }
  }

  _spawnParticle(goal, life) {
    const ttl = 1.6 + Math.random() * 1.6;
    return {
      x: goal.x + 6 + Math.random() * (goal.w - 12),
      y: goal.y + goal.h * (0.35 + Math.random() * 0.6),
      vy: -(10 + Math.random() * 18),
      life: life * ttl,
      ttl,
      r: 1 + Math.random() * 1.6,
    };
  }
}

export default VisualState;
