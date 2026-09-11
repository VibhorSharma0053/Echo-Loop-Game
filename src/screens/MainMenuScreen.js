/**
 * MainMenuScreen — the title screen, and the game's true entry point.
 *
 * Visually consistent with the rest of the game: flat colors, the same canvas
 * primitives used by the other screens, no new assets. The background motif is
 * the game's own idea rendered literally — a live square trailed by two echoes
 * replaying the same little path a beat behind it.
 */
import { Menu } from "../ui/Menu.js";
import { drawPanel, drawButton, drawText } from "../render/ui.js";
import { UI, echoGhost } from "../render/palette.js";
import { getTotalStars } from "../storage/SaveData.js";

export const VERSION = "v1.1.0";

export class MainMenuScreen {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{width:number,height:number}} viewport
   * @param {(action:"play"|"mute") => void} onAction
   * @param {() => boolean} isMuted
   * @param {number} levelCount
   */
  constructor(ctx, viewport, onAction, isMuted, levelCount) {
    this.ctx = ctx;
    this.viewport = viewport;
    this.onAction = onAction;
    this.isMuted = isMuted;
    this.levelCount = levelCount;
    this.menu = new Menu();
    this.time = 0;
    this.totalStars = 0;
  }

  /** Refresh progress and lay out the buttons. Call on every entry. */
  open() {
    this.totalStars = getTotalStars();
    this.time = 0;

    const { width, height } = this.viewport;
    const bw = 190;
    const bh = 46;
    const cx = width / 2;
    const top = height / 2 + 36;

    this.menu.setItems([
      { id: "play", label: "Play", x: cx - bw / 2, y: top, w: bw, h: bh },
      {
        id: "mute",
        label: this._muteLabel(),
        x: cx - bw / 2,
        y: top + bh + 12,
        w: bw,
        h: 34,
      },
    ]);
    this.menu.setFocus(0);
  }

  _muteLabel() {
    return this.isMuted() ? "Sound: Off" : "Sound: On";
  }

  /** Keep the mute button's caption in step with the audio state. */
  syncLabels() {
    const item = this.menu.items.find((i) => i.id === "mute");
    if (item) item.label = this._muteLabel();
  }

  /** @param {number} dt real seconds */
  update(dt) {
    this.time += dt;
    this.syncLabels();
  }

  // --- input ---------------------------------------------------------------

  /** @param {KeyboardEvent} event @returns {boolean} handled */
  handleKey(event) {
    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        this.menu.move("up");
        return true;
      case "ArrowDown":
      case "KeyS":
        this.menu.move("down");
        return true;
      case "Tab":
        this.menu.cycle(event.shiftKey ? -1 : 1);
        return true;
      case "Enter":
      case "NumpadEnter":
      case "Space": {
        const item = this.menu.activate();
        if (item) this.onAction(item.id);
        return true;
      }
      default:
        return false;
    }
  }

  pointerMove(x, y) {
    this.menu.pointerMove(x, y);
  }

  pointerDown(x, y) {
    const item = this.menu.pointerActivate(x, y);
    if (item) this.onAction(item.id);
  }

  // --- draw ----------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    const { width, height } = this.viewport;

    ctx.save();
    ctx.fillStyle = "#070b13";
    ctx.fillRect(0, 0, width, height);
    const grad = ctx.createRadialGradient(
      width / 2,
      height * 0.42,
      40,
      width / 2,
      height * 0.42,
      width * 0.75,
    );
    grad.addColorStop(0, "rgba(34, 211, 238, 0.10)");
    grad.addColorStop(1, "rgba(4, 6, 11, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    this._drawEchoMotif();

    // Wordmark.
    drawText(ctx, "ECHO LOOP", width / 2, height * 0.3, {
      size: 52,
      weight: 700,
      color: "#e8f6fb",
      letterSpacing: "14px",
    });
    drawText(ctx, "your past selves solve it with you", width / 2, height * 0.3 + 40, {
      size: 11,
      color: UI.textDim,
      letterSpacing: "5px",
    });

    for (let i = 0; i < this.menu.items.length; i += 1) {
      drawButton(ctx, this.menu.items[i], {
        focused: i === this.menu.focusIndex,
        accent: UI.accent,
      });
    }

    // Progress line, only once the player has actually earned something.
    if (this.totalStars > 0) {
      drawText(
        ctx,
        `★ ${this.totalStars} / ${this.levelCount * 3} collected`,
        width / 2,
        height - 62,
        { size: 11, weight: 600, color: "#fbbf24" },
      );
    }

    drawText(
      ctx,
      `${VERSION}  ·  ${this.levelCount} levels · 2 chapters  ·  vanilla js + canvas 2d`,
      width / 2,
      height - 38,
      { size: 9.5, color: UI.textDim, letterSpacing: "1px" },
    );
    drawText(ctx, "enter / click to play  ·  M mutes", width / 2, height - 20, {
      size: 9.5,
      color: "rgba(199, 211, 224, 0.35)",
      letterSpacing: "1px",
    });
  }

  /**
   * A live square tracing a slow path with two echoes lagging behind it —
   * the core mechanic, used as decoration.
   */
  _drawEchoMotif() {
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    const cx = width / 2;
    const cy = height * 0.3 - 78;
    const size = 13;

    /** Position along a gentle lissajous path at time t. */
    const at = (t) => ({
      x: cx + Math.sin(t * 0.7) * 210,
      y: cy + Math.sin(t * 1.4) * 16,
    });

    ctx.save();
    // Echoes first (older = further behind and dimmer), then the live square.
    for (let i = 2; i >= 1; i -= 1) {
      const p = at(this.time - i * 0.55);
      ctx.fillStyle = echoGhost(i - 1, 0.85);
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }
    const live = at(this.time);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(
      Math.round(live.x - size / 2),
      Math.round(live.y - size / 2),
      size,
      size,
    );
    ctx.restore();
  }
}

export default MainMenuScreen;
