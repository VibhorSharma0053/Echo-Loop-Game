/**
 * LoopManager — owns the time loop: the tick clock, the input recorder, the
 * echo stack, and the reset that ties them together.
 *
 * Per fixed tick it:
 *   1. samples the live player's input and appends it to the recording
 *      (recording[i] is always the input used on tick i — that index
 *      alignment is what makes replay faithful),
 *   2. steps the live player with that input, then resolves collisions,
 *   3. steps every echo with ITS recorded input for the same tick index, so
 *      all echoes stay in lockstep with the loop clock,
 *   4. ends the loop when the clock runs out.
 *
 * On loop end the finished recording is frozen into a new Echo, every entity
 * is returned to the level's start position, the clock resets to 0, and a
 * fresh empty recording begins. Everything the echo needs (spawn state +
 * inputs) is therefore identical to what the live player had, which is why
 * an echo re-performs the run instead of merely playing back a path.
 */
import { Echo } from "./Echo.js";

export class LoopManager {
  /**
   * @param {object} config
   * @param {import("./Player.js").Player} config.player the live player
   * @param {{ getCurrentInputState: () => {left:boolean,right:boolean,jump:boolean,interact:boolean} }} config.input
   *   Any input source: the keyboard today, touch controls later.
   * @param {{x:number,y:number}} config.spawn level start position
   * @param {number} config.loopDurationTicks loop length (900 = 15s at 60Hz)
   * @param {number} [config.maxEchoes] echo budget for the level
   * @param {(entity: object) => void} [config.resolveCollisions]
   *   Called right after each entity moves, to resolve it against the world.
   * @param {{ reset: () => void } | null} [config.level]
   *   The loaded Level. Its reset() is called on every loop boundary so each
   *   loop replays against an identical world.
   * @param {((currentTick: number) => void) | null} [config.onBeforeStep]
   *   Runs each tick BEFORE any entity moves. This is where the world itself
   *   advances (moving platforms) and where riders are carried, so entities
   *   then run their physics against the world's new state.
   * @param {((currentTick: number) => boolean | void) | null} [config.onAfterStep]
   *   Runs each tick after every entity has moved and collided, but BEFORE
   *   the loop clock advances. Use it to update world state (switches/doors)
   *   and to detect win conditions. Return true to halt the loop — that stops
   *   the clock, so a goal reached on a loop's final tick is not erased by the
   *   reset that would otherwise follow.
   * @param {(info: {loopIndex:number, echoCount:number, echoAdded:boolean}) => void} [config.onLoopEnd]
   */
  constructor({
    player,
    input,
    spawn,
    loopDurationTicks,
    maxEchoes = 2,
    resolveCollisions = () => {},
    level = null,
    onBeforeStep = null,
    onAfterStep = null,
    onLoopEnd = null,
  }) {
    if (!player) throw new TypeError("LoopManager requires a player.");
    if (!input || typeof input.getCurrentInputState !== "function") {
      throw new TypeError(
        "LoopManager requires an input source exposing getCurrentInputState().",
      );
    }
    if (!Number.isInteger(loopDurationTicks) || loopDurationTicks <= 0) {
      throw new TypeError("loopDurationTicks must be a positive integer.");
    }

    this.player = player;
    this.input = input;
    this.spawn = { x: spawn.x, y: spawn.y };
    this.loopDurationTicks = loopDurationTicks;
    this.maxEchoes = maxEchoes;
    this.resolveCollisions = resolveCollisions;
    this.level = level;
    this.onBeforeStep = onBeforeStep;
    this.onAfterStep = onAfterStep;
    this.onLoopEnd = onLoopEnd;

    /** Tick index within the current loop: 0 .. loopDurationTicks-1. */
    this.currentTick = 0;
    /** How many loops have completed since the level started. */
    this.loopIndex = 0;
    /** @type {Array<{left:boolean,right:boolean,jump:boolean,interact:boolean}>} */
    this.recording = [];
    /** @type {Echo[]} oldest first; index doubles as the echo's color slot. */
    this.echoes = [];
  }

  /** Ticks left in this loop. */
  get ticksRemaining() {
    return this.loopDurationTicks - this.currentTick;
  }

  /** Loop completion in 0..1, for the progress indicator. */
  get progress() {
    return this.currentTick / this.loopDurationTicks;
  }

  /** True once the echo budget is spent (further loops add no echoes). */
  get echoBudgetFull() {
    return this.echoes.length >= this.maxEchoes;
  }

  /**
   * Advance the whole loop simulation by one fixed step.
   * @param {number} fixedDt
   */
  tick(fixedDt) {
    // 0. Advance the world itself (moving platforms) and carry their riders,
    //    so every entity runs its physics against this tick's world state.
    this.onBeforeStep?.(this.currentTick);

    // 1. Sample + record. Frozen so nothing downstream can mutate history.
    const inputState = Object.freeze({ ...this.input.getCurrentInputState() });
    this.recording.push(inputState);

    // 2. Live player.
    this.player.physicsStep(inputState, fixedDt);
    this.resolveCollisions(this.player);

    // 3. Echoes, in lockstep with the same tick index.
    for (const echo of this.echoes) {
      echo.physicsStep(fixedDt, this.currentTick);
      this.resolveCollisions(echo);
    }

    // 4. World reacts to the new positions (switches, doors, win check).
    //    A truthy return halts the loop before the clock moves.
    if (this.onAfterStep?.(this.currentTick) === true) return;

    // 5. Advance the clock; end the loop when the timer runs out.
    this.currentTick += 1;
    if (this.currentTick >= this.loopDurationTicks) {
      this.endLoop();
    }
  }

  /**
   * Abort the current attempt immediately (the R quick-restart).
   *
   * DESIGN: an aborted attempt is deliberately NOT banked as an echo. An echo
   * represents a loop the player intentionally "spent" — a committed take
   * they want their future selves to repeat. Bailing out early means the take
   * went wrong, so recording it would actively work against the player: it
   * would burn one of their limited maxEchoes slots on a useless ghost and
   * force a full level restart to clear it. Aborting therefore runs the exact
   * same reset path as a natural timeout (world reset, respawn, clock rewind,
   * fresh recording) and skips only the freeze-recording-into-an-Echo step.
   * The loop counter still advances, so the attempt is not pretended away.
   */
  abortLoop() {
    this.endLoop({ bankEcho: false, reason: "abort" });
  }

  /**
   * Close the current loop: promote the recording to an echo (budget
   * permitting), rewind the world clock, and respawn every entity.
   *
   * @param {{ bankEcho?: boolean, reason?: "timeout"|"abort" }} [options]
   *   bankEcho=false discards the attempt's recording (see abortLoop).
   */
  endLoop({ bankEcho = true, reason = "timeout" } = {}) {
    const finishedRecording = this.recording;
    let echoAdded = false;

    if (bankEcho && !this.echoBudgetFull) {
      this.echoes.push(
        new Echo(
          Object.freeze(finishedRecording),
          this.spawn.x,
          this.spawn.y,
          this.player.w,
          this.player.h,
          { index: this.echoes.length },
        ),
      );
      echoAdded = true;
    } else if (bankEcho) {
      console.log(
        `[echo-loop] Echo limit reached (${this.maxEchoes}/${this.maxEchoes}) — ` +
          `loop ${this.loopIndex + 1}'s recording was discarded. ` +
          `Existing echoes keep replaying.`,
      );
    }

    // Fresh recording + rewound clock for the new loop.
    this.recording = [];
    this.currentTick = 0;
    this.loopIndex += 1;

    // The world goes back to its initial configuration first (doors shut,
    // plates released), then everyone returns to the start line — so echo
    // replays begin from exactly the state their recording began from.
    this.level?.reset();
    this.player.reset(this.spawn.x, this.spawn.y);
    for (const echo of this.echoes) echo.reset();

    this.onLoopEnd?.({
      loopIndex: this.loopIndex,
      echoCount: this.echoes.length,
      echoAdded,
      reason,
    });
  }

  /** Wipe all echoes and start the level over from loop 1. */
  resetLevel() {
    this.echoes = [];
    this.recording = [];
    this.currentTick = 0;
    this.loopIndex = 0;
    this.level?.reset();
    this.player.reset(this.spawn.x, this.spawn.y);
  }
}
