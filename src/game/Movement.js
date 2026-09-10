/**
 * Movement — THE single source of truth for character physics.
 *
 * Both the live Player and every replayed Echo call applyMovement(). That is
 * not a style preference, it is the load-bearing invariant of the whole game:
 * an echo is trustworthy only if feeding it the recorded input stream
 * reproduces exactly what the player did. If Player and Echo ever had
 * separate copies of this math, echoes would drift and the core mechanic
 * would silently break.
 *
 * The function is deterministic: it reads only (body, input, dt) and mutates
 * only the body. No wall-clock time, no randomness, no rAF, no globals.
 *
 * Units: pixels, pixels/second, pixels/second^2 in the 960x540 canvas space.
 */

// --- Movement tuning --------------------------------------------------------

export const MOVE_SPEED = 240; // max horizontal speed, px/s
export const GROUND_ACCEL = 2000; // px/s^2 toward max while steering on the ground
export const GROUND_FRICTION = 2400; // px/s^2 back toward 0 when no direction held
export const AIR_ACCEL = 1400; // weaker steering while airborne
export const AIR_FRICTION = 400; // gentle drag in air so momentum mostly carries
export const GRAVITY = 2200; // px/s^2 downward
export const JUMP_SPEED = 750; // px/s upward impulse (~128px jump height)
export const MAX_FALL_SPEED = 900; // terminal velocity; keeps per-step fall < platform thickness

/** Neutral input, used when a recording has no entry for a tick. */
export const IDLE_INPUT = Object.freeze({
  left: false,
  right: false,
  jump: false,
  interact: false,
});

/**
 * Move `current` toward `target` by at most `maxDelta`, never overshooting.
 */
function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/**
 * Give a body the standard character-physics fields (also used as a reset).
 *
 * @param {object} body
 * @param {number} x top-left spawn position
 * @param {number} y
 */
export function resetBody(body, x, y) {
  body.x = x;
  body.y = y;
  body.vx = 0;
  body.vy = 0;
  // Position at the START of the current step; the AABB resolver reads these
  // to infer which face of an obstacle was entered.
  body.prevX = x;
  body.prevY = y;
  body.grounded = false;
  // Previous tick's jump state, for press-edge detection.
  body.jumpHeld = false;
  // Id of the moving platform this body is standing on, or null. Cleared on
  // reset so a respawned entity is never carried by a stale contact.
  body.ridingId = null;
  // Read-only OUTPUT flag: true on the tick a jump impulse fired. Presentation
  // layers (audio) read it; nothing in the simulation reads it back, so it
  // cannot influence physics or echo determinism.
  body.jumpedThisTick = false;
  return body;
}

/**
 * Advance one character body by a single fixed tick.
 *
 * @param {{x:number,y:number,vx:number,vy:number,w:number,h:number,prevX:number,prevY:number,grounded:boolean,jumpHeld:boolean}} body
 * @param {{left:boolean,right:boolean,jump:boolean,interact:boolean}} input
 * @param {number} dt fixed timestep in seconds (see GameLoop.FIXED_DT)
 */
export function applyMovement(body, input, dt) {
  const state = input || IDLE_INPUT;

  // --- Horizontal: accelerate toward max speed, or brake with friction ---
  let dir = 0;
  if (state.left) dir -= 1;
  if (state.right) dir += 1;

  const rate = body.grounded
    ? dir !== 0
      ? GROUND_ACCEL
      : GROUND_FRICTION
    : dir !== 0
      ? AIR_ACCEL
      : AIR_FRICTION;
  body.vx = approach(body.vx, dir * MOVE_SPEED, rate * dt);

  // --- Jump: edge-triggered impulse, grounded only ---
  // Only a FRESH press jumps: holding the key never re-triggers, so the
  // impulse is a pure function of the tick stream (echo-safe).
  const jumpPressed = state.jump && !body.jumpHeld;
  body.jumpHeld = state.jump;
  body.jumpedThisTick = false;
  if (jumpPressed && body.grounded) {
    body.vy = -JUMP_SPEED;
    body.grounded = false;
    body.jumpedThisTick = true; // output only — see resetBody
  }

  // --- Gravity (constant downward acceleration, capped) ---
  body.vy = Math.min(body.vy + GRAVITY * dt, MAX_FALL_SPEED);

  // --- Integrate ---
  body.prevX = body.x;
  body.prevY = body.y;
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  // Grounded is derived: cleared here, re-established by collision
  // resolution (a "top" contact) later in the same tick.
  body.grounded = false;
}
