/**
 * LevelSelectScreen — every level, grouped by chapter, with saved stars.
 *
 * Reads progress from SaveData every time it is opened (never caches), so a
 * rating earned seconds ago — or in a previous session — is always shown.
 */
import { Menu } from "../ui/Menu.js";
import { drawPanel, drawStarRow, drawText } from "../render/ui.js";
import { UI } from "../render/palette.js";
import {
  getAllProgress,
  getTotalStars,
  isUsingMemoryFallback,
} from "../storage/SaveData.js";
import { formatTime } from "../game/scoring.js";

const TILE_W = 170;
const TILE_H = 100;
const GAP_X = 16;
const PER_ROW = 5;
/** Vertical space one chapter block occupies (label + row of tiles). */
const CHAPTER_LABEL_H = 26;
const CHAPTER_GAP = 34;

/** Short flavour text per chapter, shown next to the chapter heading. */
const CHAPTER_BLURB = {
  1: "switches & echoes",
  2: "moving platforms",
};

export class LevelSelectScreen {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{width:number,height:number}} viewport
   * @param {Array<object>} levels level-data array
   * @param {(index:number) => void} onPick
   */
  constructor(ctx, viewport, levels, onPick) {
    this.ctx = ctx;
    this.viewport = viewport;
    this.levels = levels;
    this.onPick = onPick;
    this.menu = new Menu();
    this.progress = {};
    this.totalStars = 0;
    this.time = 0;
    /** @type {Array<{chapter:number, labelY:number, items:any[]}>} */
    this.groups = [];
  }

  /** Rebuild tiles + refresh saved progress. Call on every entry. */
  open(focusIndex = 0) {
    this.progress = getAllProgress();
    this.totalStars = getTotalStars();

    // Group levels by chapter, preserving array order.
    /** @type {Map<number, Array<{data:object, index:number}>>} */
    const byChapter = new Map();
    this.levels.forEach((data, index) => {
      const chapter = data.chapter ?? 1;
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter).push({ data, index });
    });

    // Measure the whole stack so it can be vertically centred below the header.
    let stackH = 0;
    for (const entries of byChapter.values()) {
      const rows = Math.ceil(entries.length / PER_ROW);
      stackH += CHAPTER_LABEL_H + rows * TILE_H + (rows - 1) * 12 + CHAPTER_GAP;
    }
    stackH -= CHAPTER_GAP;

    const headerBottom = 118;
    let y = headerBottom + Math.max(0, (this.viewport.height - headerBottom - 46 - stackH) / 2);

    const items = [];
    this.groups = [];

    for (const [chapter, entries] of byChapter) {
      const labelY = y + CHAPTER_LABEL_H / 2;
      const groupItems = [];
      y += CHAPTER_LABEL_H;

      entries.forEach((entry, i) => {
        const row = Math.floor(i / PER_ROW);
        const col = i % PER_ROW;
        const inRow = Math.min(PER_ROW, entries.length - row * PER_ROW);
        const rowW = inRow * TILE_W + (inRow - 1) * GAP_X;
        const startX = (this.viewport.width - rowW) / 2;
        const item = {
          id: entry.data.id,
          index: entry.index,
          label: entry.data.id,
          data: entry.data,
          chapter,
          x: startX + col * (TILE_W + GAP_X),
          y: y + row * (TILE_H + 12),
          w: TILE_W,
          h: TILE_H,
        };
        items.push(item);
        groupItems.push(item);
      });

      const rows = Math.ceil(entries.length / PER_ROW);
      y += rows * TILE_H + (rows - 1) * 12 + CHAPTER_GAP;
      this.groups.push({ chapter, labelY, items: groupItems });
    }

    this.menu.setItems(items);
    this.menu.setFocus(Math.max(0, Math.min(focusIndex, items.length - 1)));
  }

  /** @param {number} dt real seconds */
  update(dt) {
    this.time += dt;
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
        if (item) this.onPick(item.index);
        return true;
      }
      default: {
        // Number keys pick within the CHAPTER currently focused, so "3" means
        // 1-3 or 2-3 depending on which row you are on.
        const match = /^Digit([1-9])$/.exec(event.code);
        if (match) {
          const slot = Number(match[1]) - 1;
          const focused = this.menu.focused;
          const group =
            this.groups.find((g) => g.chapter === focused?.chapter) ??
            this.groups[0];
          const target = group?.items[slot];
          if (target) {
            this.onPick(target.index);
            return true;
          }
        }
        return false;
      }
    }
  }

  pointerMove(x, y) {
    this.menu.pointerMove(x, y);
  }

  pointerDown(x, y) {
    const item = this.menu.pointerActivate(x, y);
    if (item) this.onPick(item.index);
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
      height / 2,
      60,
      width / 2,
      height / 2,
      width * 0.7,
    );
    grad.addColorStop(0, "rgba(34, 211, 238, 0.07)");
    grad.addColorStop(1, "rgba(4, 6, 11, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    drawText(ctx, "ECHO LOOP", width / 2, 50, {
      size: 26,
      weight: 700,
      color: "#e8f6fb",
      letterSpacing: "8px",
    });
    drawText(ctx, "SELECT A LEVEL", width / 2, 78, {
      size: 10,
      color: UI.textDim,
      letterSpacing: "4px",
    });
    drawText(
      ctx,
      `★ ${this.totalStars} / ${this.levels.length * 3}`,
      width / 2,
      101,
      { size: 13, weight: 600, color: "#fbbf24" },
    );

    // Chapter headings, aligned with the left edge of their tile row.
    for (const group of this.groups) {
      const first = group.items[0];
      const left = first ? first.x : 40;
      drawText(ctx, `CHAPTER ${group.chapter}`, left + 2, group.labelY, {
        size: 11,
        weight: 700,
        color: UI.text,
        align: "left",
        letterSpacing: "3px",
      });
      const blurb = CHAPTER_BLURB[group.chapter];
      if (blurb) {
        drawText(ctx, blurb, left + 112, group.labelY, {
          size: 9.5,
          color: UI.textDim,
          align: "left",
          letterSpacing: "1px",
        });
      }
      // Earned/total for this chapter, right-aligned over the row.
      const last = group.items[group.items.length - 1];
      const earned = group.items.reduce(
        (sum, it) => sum + (this.progress[it.id]?.stars ?? 0),
        0,
      );
      drawText(
        ctx,
        `${earned}/${group.items.length * 3}`,
        (last ? last.x + last.w : width - 40) - 2,
        group.labelY,
        { size: 9.5, color: UI.textDim, align: "right" },
      );
    }

    for (let i = 0; i < this.menu.items.length; i += 1) {
      this._drawTile(this.menu.items[i], i === this.menu.focusIndex);
    }

    const hint = isUsingMemoryFallback()
      ? "progress can't be saved in this browser — ratings last for this session only"
      : "arrows / mouse to choose · enter or click to play";
    drawText(ctx, hint, width / 2, height - 22, {
      size: 10,
      color: isUsingMemoryFallback() ? UI.warn : UI.textDim,
      letterSpacing: "1px",
    });
  }

  _drawTile(item, focused) {
    const ctx = this.ctx;
    const record = this.progress[item.id] ?? {
      stars: 0,
      echoesUsed: null,
      timeMs: null,
    };
    const solved = record.stars > 0;
    const pulse = focused ? 0.5 + 0.5 * Math.sin(this.time * 4) : 0;

    drawPanel(ctx, item.x, item.y, item.w, item.h, {
      fill: focused ? "rgba(20, 34, 51, 0.95)" : "rgba(13, 20, 33, 0.9)",
      stroke: focused
        ? `rgba(34, 211, 238, ${0.55 + pulse * 0.45})`
        : solved
          ? "rgba(52, 211, 153, 0.3)"
          : "rgba(148, 163, 184, 0.18)",
      lineWidth: focused ? 2 : 1,
      radius: 12,
      glow: focused ? "rgba(34, 211, 238, 0.35)" : null,
    });

    drawText(ctx, item.data.id, item.x + 14, item.y + 24, {
      size: 18,
      weight: 700,
      color: focused ? "#e8f6fb" : UI.text,
      align: "left",
    });

    if (solved) {
      drawText(ctx, "✓", item.x + item.w - 14, item.y + 22, {
        size: 13,
        weight: 700,
        color: UI.good,
        align: "right",
      });
    }

    drawStarRow(ctx, item.x + item.w / 2, item.y + 55, record.stars, {
      size: 10,
      gap: 10,
    });

    const footer = solved
      ? `${record.echoesUsed ?? "?"} echo${record.echoesUsed === 1 ? "" : "es"} · ${formatTime(record.timeMs)}`
      : `${item.data.maxEchoes} echoes · ${Math.round(item.data.loopDurationTicks / 60)}s`;
    drawText(ctx, footer, item.x + item.w / 2, item.y + item.h - 18, {
      size: 9,
      color: UI.textDim,
    });
  }
}

export default LevelSelectScreen;
