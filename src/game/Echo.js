/**
 * Echo — a ghost of a previous loop, driven by that loop's recorded inputs.
 *
 * An echo stores NOTHING about where the player was. It stores only what the
 * player *pressed*, tick by tick, and re-runs those presses through the same
 * applyMovement() the live player uses. Because the simulation is a fixed
 * 60Hz timestep and the movement math is deterministic, replaying the input
 * stream from the same spawn state reproduces the same trajectory — the echo
 * genuinely re-performs the run rather than following a recorded path.
 *
 * A consequence worth keeping in mind (and a design feature): if the WORLD
 * differs this loop — a door that is now open, a block that moved — the echo
 * reacts to it, because it is really being simulated, not played back.
 */
import { applyMovement, resetBody, IDLE_INPUT } from "./Movement.js";

export class Echo {
  /**
   * @param {ReadonlyArray<{left:boolean,right:boolean,jump:boolean,interact:boolean}>} recordedInputs
   *   One entry per tick of the loop that produced this echo.
   * @param {number} x level start position (identical to the player's spawn)
   * @param {number} y
   * @param {number} [w] hitbox width — must match the player's
   * @param {number} [h] hitbox height
   * @param {{index?: number}} [options] index = which echo this is (0-based),
   *   used by the renderer to pick a color.
   */
  constructor(recordedInputs, x, y, w = 22, h = 30, { index = 0 } = {}) {
    /** @type {ReadonlyArray<{left:boolean,right:boolean,jump:boolean,interact:boolean}>} */
    this.recordedInputs = recordedInputs;
    this.w = w;
    this.h = h;
    this.spawnX = x;
    this.spawnY = y;
    this.index = index;
    /** Lets the world tell replays apart from the live player. */
    this.isEcho = true;
    resetBody(this, x, y);
  }

  /** Number of recorded ticks (normally one full loop). */
  get length() {
    return this.recordedInputs.length;
  }

  /**
   * The input this echo replays on a given loop tick. Wraps with modulo so an
   * echo keeps looping forever, in sync with the loop's tick counter.
   * @param {number} tick
   */
  inputAt(tick) {
    const n = this.recordedInputs.length;
    if (n === 0) return IDLE_INPUT;
    const i = ((tick % n) + n) % n; // safe for negative ticks
    return this.recordedInputs[i] || IDLE_INPUT;
  }

  /**
   * Advance this echo one fixed tick of the current loop.
   * @param {number} fixedDt
   * @param {number} currentLoopTick tick index within the current loop
   */
  physicsStep(fixedDt, currentLoopTick) {
    applyMovement(this, this.inputAt(currentLoopTick), fixedDt);
  }

  /** Return to the level start state at the beginning of each loop. */
  reset() {
    resetBody(this, this.spawnX, this.spawnY);
  }
}
