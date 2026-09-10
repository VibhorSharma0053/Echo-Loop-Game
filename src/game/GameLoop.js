/**
 * GameLoop — fixed-timestep simulation driver built on requestAnimationFrame.
 *
 * WHY FIXED TIMESTEP (this is a core design constraint of Echo Loop):
 * The echo mechanic (implemented in a later phase) records the per-tick input
 * stream and replays it through the exact same simulation code. That replay
 * is only faithful if every step of the simulation advances by the SAME dt
 * every time, on every machine, regardless of the display. rAF fires at the
 * monitor's refresh rate (60Hz / 120Hz / 144Hz...) with jitter, so "dt = time
 * since last frame" would make physics depend on the player's hardware and
 * would desynchronize echo replays.
 *
 * Instead: real elapsed time is fed into an accumulator and consumed in
 * constant 16.67ms chunks. tick(fixedDt) runs zero or more times per
 * animation frame; render() runs exactly once per frame with the newest
 * state. Same input sequence + same step count => identical states.
 *
 * Note: dropping the backlog (below) only occurs when the machine cannot
 * simulate 60Hz in real time at all; the tick stream itself — the thing a
 * replay depends on — is unaffected.
 */

/** Seconds per simulation step (60 Hz). Exported for the future recorder. */
export const FIXED_DT = 1 / 60;

/** Clamp absurd frame gaps (tab hidden, breakpoint pause) to a quarter second. */
const MAX_FRAME_TIME = 0.25;

/** Bail out of the catch-up loop instead of spiraling to death on slow machines. */
const MAX_STEPS_PER_FRAME = 5;

export class GameLoop {
  /**
   * @param {object} hooks
   * @param {(fixedDt: number) => void} hooks.tick
   *   One deterministic simulation step. Called 0..N times per frame,
   *   always with FIXED_DT.
   * @param {() => void} hooks.render
   *   Draw the current simulation state. Called once per animation frame,
   *   after all of that frame's ticks.
   */
  constructor({ tick, render }) {
    if (typeof tick !== "function" || typeof render !== "function") {
      throw new TypeError("GameLoop requires { tick, render } functions.");
    }
    this.tick = tick;
    this.render = render;
    this.fixedDt = FIXED_DT;

    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.rafId = 0;
    this.running = false;

    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this._frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  _frame(timestamp) {
    if (!this.running) return;

    let elapsed = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    if (elapsed > MAX_FRAME_TIME) elapsed = MAX_FRAME_TIME;

    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < MAX_STEPS_PER_FRAME) {
      this.tick(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }
    // Still behind after catching up? Discard the remainder — the game slows
    // down gracefully rather than freezing (classic "spiral of death").
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.render();
    this.rafId = requestAnimationFrame(this._frame);
  }
}
