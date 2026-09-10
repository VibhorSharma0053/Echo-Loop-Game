/**
 * Player — the white rectangle the human controls.
 *
 * The physics itself lives in Movement.js (applyMovement) and is shared
 * verbatim with Echo, so a recorded input stream replays into the exact same
 * trajectory the player produced. Player adds nothing to the simulation
 * beyond hitbox size and spawn bookkeeping.
 */
import { applyMovement, resetBody } from "./Movement.js";

export class Player {
  /**
   * @param {number} x spawn position, pixels (top-left corner)
   * @param {number} y
   * @param {number} [w] hitbox width
   * @param {number} [h] hitbox height
   */
  constructor(x, y, w = 22, h = 30) {
    this.w = w;
    this.h = h;
    this.spawnX = x;
    this.spawnY = y;
    /** Distinguishes the live player from echoes (see echoesCanActivate). */
    this.isEcho = false;
    resetBody(this, x, y);
  }

  /**
   * Advance the player one fixed tick.
   * @param {{left:boolean,right:boolean,jump:boolean,interact:boolean}} inputState
   * @param {number} fixedDt
   */
  physicsStep(inputState, fixedDt) {
    applyMovement(this, inputState, fixedDt);
  }

  /**
   * Return to the level start state (called by LoopManager on every loop end).
   * @param {number} [x] defaults to the spawn point given at construction
   * @param {number} [y]
   */
  reset(x = this.spawnX, y = this.spawnY) {
    this.spawnX = x;
    this.spawnY = y;
    resetBody(this, x, y);
  }
}
