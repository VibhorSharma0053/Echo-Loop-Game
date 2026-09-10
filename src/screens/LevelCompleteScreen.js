/**
 * LevelCompleteScreen — the win overlay.
 *
 * Drawn ON TOP of the frozen level (the world stays visible behind a scrim),
 * so the player still sees the echoes standing on the switches that let them
 * through. Stars pop in one at a time for a bit of reward cadence.
 */
import { Menu } from "../ui/Menu.js";
import { drawPanel, drawScrim, drawStarRow, drawButton, drawText } from "../render/ui.js";
import { UI } from "../render/palette.js";
import { formatTime } from "../game/scoring.js";

const PANEL_W = 460;
const PANEL_H = 300;
/** Seconds between each star popping in. */
const STAR_STAGGER = 0.34;

export class LevelCompleteScreen {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{width:number,height:number}} viewport
   * @param {(action:"retry"|"next"|"select") => void} onAction
   */
  constructor(ctx, viewport, onAction) {
    this.ctx = ctx;
    this.viewport = viewport;
    this.onAction = onAction;
    this.menu = new Menu();
    this.time = 0;
    /** @type {any} */
    this.result = null;
  }

  /**
   * @param {object} result
   * @param {string} result.levelId
   * @param {number} result.stars earned this run
   * @param {number} result.echoesUsed
   * @param {number} result.timeMs
   * @param {number} result.loops
   * @param {number} result.bestStars best saved rating (may exceed this run)
   * @param {boolean} result.isNewBest
   * @param {boolean} result.hasNextLevel
   * @param {number} result.minEchoesForThreeStars
   */
  open(result) {
    this.result = result;
    this.time = 0;

    const { width, height } = this.viewport;
    const panelX = (width - PANEL_W) / 2;
    const panelY = (height - PANEL_H) / 2;
    this.panel = { x: panelX, y: panelY, w: PANEL_W, h: PANEL_H };

    const bw = 130;
    const bh = 40;
    const gap = 16;
    const totalW = bw * 3 + gap * 2;
    const bx = panelX + (PANEL_W - totalW) / 2;
    const by = panelY + PANEL_H - bh - 26;

    this.menu.setItems([
      { id: "retry", label: "Retry", x: bx, y: by, w: bw, h: bh },
      {
        id: "next",
        label: "Next Level",
        x: bx + bw + gap,
        y: by,
        w: bw,
        h: bh,
        disabled: !result.hasNextLevel,
      },
      { id: "select", label: "Levels", x: bx + (bw + gap) * 2, y: by, w: bw, h: bh },
    ]);
    // Default to the most likely next action.
    this.menu.focusById(result.hasNextLevel ? "next" : "select");
  }

  update(dt) {
    this.time += dt;
  }

  /** Per-star 0..1 pop progress. */
  _starScales() {
    const scales = [];
    for (let i = 0; i < 3; i += 1) {
      const start = 0.25 + i * STAR_STAGGER;
      scales.push(Math.max(0, Math.min(1, (this.time - start) / 0.22)));
    }
    return scales;
  }

  // --- input ---------------------------------------------------------------

  /** @param {KeyboardEvent} event @returns {boolean} handled */
  handleKey(event) {
    switch (event.code) {
      case "ArrowLeft":
      case "KeyA":
        this.menu.move("left");
        return true;
      case "ArrowRight":
      case "KeyD":
        this.menu.move("right");
        return true;
      case "Tab":
        this.menu.cycle(event.shiftKey ? -1 : 1);
        return true;
      case "Enter":
      case "NumpadEnter":
      case "Space": {
        const item = this.menu.activate();
        if (item && !item.disabled) this.onAction(item.id);
        return true;
      }
      case "KeyR":
        this.onAction("retry");
        return true;
      case "Escape":
        this.onAction("select");
        return true;
      default:
        return false;
    }
  }

  pointerMove(x, y) {
    this.menu.pointerMove(x, y);
  }

  pointerDown(x, y) {
    const item = this.menu.pointerActivate(x, y);
    if (item && !item.disabled) this.onAction(item.id);
  }

  // --- draw ----------------------------------------------------------------

  draw() {
    if (!this.result) return;
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    const p = this.panel;
    const r = this.result;

    drawScrim(ctx, width, height, 0.68);
    drawPanel(ctx, p.x, p.y, p.w, p.h, {
      fill: "rgba(10, 16, 27, 0.96)",
      stroke: "rgba(52, 211, 153, 0.35)",
      radius: 16,
      glow: "rgba(52, 211, 153, 0.25)",
    });

    drawText(ctx, "LOOP CLOSED", p.x + p.w / 2, p.y + 38, {
      size: 20,
      weight: 700,
      color: UI.good,
      letterSpacing: "6px",
    });
    drawText(ctx, `level ${r.levelId}`, p.x + p.w / 2, p.y + 62, {
      size: 11,
      color: UI.textDim,
      letterSpacing: "2px",
    });

    drawStarRow(ctx, p.x + p.w / 2, p.y + 112, r.stars, {
      size: 22,
      gap: 18,
      scales: this._starScales(),
    });

    // Stat line: how the rating was earned.
    const echoLabel = `${r.echoesUsed} echo${r.echoesUsed === 1 ? "" : "es"}`;
    drawText(
      ctx,
      `${echoLabel} · ${r.loops} loop${r.loops === 1 ? "" : "s"} · ${formatTime(r.timeMs)}`,
      p.x + p.w / 2,
      p.y + 158,
      { size: 12, color: UI.text },
    );

    // Guidance toward three stars, or celebration once earned.
    let note;
    let noteColor = UI.textDim;
    if (r.stars >= 3) {
      note = "perfect — minimum echoes used";
      noteColor = "#fbbf24";
    } else {
      const target = r.minEchoesForThreeStars;
      note = `solve with ${target} echo${target === 1 ? "" : "es"} for 3 stars`;
    }
    drawText(ctx, note, p.x + p.w / 2, p.y + 182, { size: 10.5, color: noteColor });

    if (r.isNewBest) {
      drawText(ctx, "NEW BEST", p.x + p.w / 2, p.y + 205, {
        size: 10,
        weight: 700,
        color: UI.accent,
        letterSpacing: "3px",
      });
    } else if (r.bestStars > r.stars) {
      drawText(ctx, `best: ${r.bestStars} ★`, p.x + p.w / 2, p.y + 205, {
        size: 10,
        color: UI.textDim,
      });
    }

    for (let i = 0; i < this.menu.items.length; i += 1) {
      drawButton(ctx, this.menu.items[i], {
        focused: i === this.menu.focusIndex,
        accent: UI.good,
      });
    }
  }
}

export default LevelCompleteScreen;
