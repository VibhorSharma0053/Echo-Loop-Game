/**
 * Input — keyboard state, exposed as a game-agnostic action snapshot.
 *
 * getCurrentInputState() is THE boundary between "how intent is produced"
 * (a human on a keyboard right now; an echo recording or touch buttons in
 * later phases) and "how intent is consumed" (the player physics and game
 * rules). Everything downstream sees only a plain
 * { left, right, jump, interact } boolean object, sampled once per fixed
 * tick, so the producer can be swapped without touching game logic.
 *
 * Keys are matched by KeyboardEvent.code (physical key position), so the
 * bindings work on AZERTY/Dvorak layouts too.
 */

const KEYMAP = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "KeyW", "ArrowUp"],
  interact: ["KeyE"],
};

/** All codes the game owns — their default browser behavior is suppressed. */
const GAME_KEYS = new Set(Object.values(KEYMAP).flat());

export class Input {
  /**
   * @param {Window | HTMLElement} [target]
   */
  constructor(target = window) {
    this.target = target;
    /** @type {Set<string>} physical codes currently held down */
    this.held = new Set();
    /**
     * Codes held over from a menu, ignored until physically released.
     * @type {Set<string>}
     */
    this.suppressed = new Set();

    this._onKeyDown = (event) => {
      if (!GAME_KEYS.has(event.code)) return;
      // Stop arrows/space from scrolling the page. Holding a key fires
      // repeat keydowns, but re-adding to a Set is harmless.
      event.preventDefault();
      this.held.add(event.code);
    };
    this._onKeyUp = (event) => {
      this.held.delete(event.code);
      // A real release always clears suppression.
      this.suppressed.delete(event.code);
    };
    // If focus is lost mid-press the keyup never arrives — drop all state
    // so keys don't appear "stuck" when the player alt-tabs back.
    this._onBlur = () => {
      this.held.clear();
      this.suppressed.clear();
    };
  }

  /**
   * Ignore every currently-held key until it is physically released.
   *
   * Used when entering gameplay from a menu: the Space/Enter that activated
   * "Retry" is still down, and would otherwise register as a jump on tick 0.
   * Filtering at the INPUT layer (rather than patching the player's jump
   * edge-state) keeps the recording and its echo replay identical — the
   * recorded stream simply never contains that phantom press.
   */
  suppressHeldKeys() {
    for (const code of this.held) this.suppressed.add(code);
  }

  /** Forget all key state (used when leaving gameplay). */
  clearHeldKeys() {
    this.held.clear();
    this.suppressed.clear();
  }

  attach() {
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }

  detach() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this.held.clear();
  }

  /**
   * Snapshot of movement intents for the current tick.
   * @returns {{ left: boolean, right: boolean, jump: boolean, interact: boolean }}
   */
  getCurrentInputState() {
    return {
      left: this._any(KEYMAP.left),
      right: this._any(KEYMAP.right),
      jump: this._any(KEYMAP.jump),
      interact: this._any(KEYMAP.interact),
    };
  }

  /** @param {string[]} codes */
  _any(codes) {
    return codes.some(
      (code) => this.held.has(code) && !this.suppressed.has(code),
    );
  }
}
