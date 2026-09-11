/**
 * Renderer — minimal wrapper around CanvasRenderingContext2D.
 *
 * Phase 0 exposes exactly two primitives:
 *   - clear():                 fill the whole canvas with the clear color
 *   - drawRect(x, y, w, h, color): draw a filled axis-aligned rectangle
 *
 * Later phases will extend this (sprites, echo ghosts, parallax), but the
 * canvas internal resolution stays fixed at 960x540 logical pixels.
 */

export const DEFAULT_CLEAR_COLOR = "#0a0f1a";

export class Renderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ clearColor?: string }} [options]
   */
  constructor(ctx, { clearColor = DEFAULT_CLEAR_COLOR } = {}) {
    if (!ctx) {
      throw new TypeError("Renderer requires a CanvasRenderingContext2D.");
    }
    /** @type {CanvasRenderingContext2D} */
    this.ctx = ctx;
    /** @type {string} */
    this.clearColor = clearColor;
  }

  /** Canvas width in logical (internal-resolution) pixels. */
  get width() {
    return this.ctx.canvas.width;
  }

  /** Canvas height in logical (internal-resolution) pixels. */
  get height() {
    return this.ctx.canvas.height;
  }

  /**
   * Fill the entire canvas with a solid color (defaults to clearColor).
   * @param {string} [color]
   */
  clear(color = this.clearColor) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw a filled rectangle in canvas space.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color - any valid CSS color string
   */
  drawRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  // --- shape + glow primitives ----------------------------------------------

  /**
   * Trace a rounded rectangle. Uses the native ctx.roundRect() where
   * available, with an arcTo fallback for older engines.
   */
  roundRectPath(x, y, w, h, r) {
    const ctx = this.ctx;
    const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  /** Filled rounded rectangle. `fill` may be a color string or a gradient. */
  fillRoundRect(x, y, w, h, r, fill) {
    this.roundRectPath(x, y, w, h, r);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
  }

  /** Stroked rounded rectangle. */
  strokeRoundRect(x, y, w, h, r, color, lineWidth = 1) {
    this.roundRectPath(x, y, w, h, r);
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeStyle = color;
    this.ctx.stroke();
  }

  /**
   * Run `draw` with a drop-shadow glow active, then guarantee the shadow is
   * switched off again.
   *
   * Leaving shadowBlur set is the classic Canvas performance trap — every
   * later fill on the frame would silently pay for a blur it doesn't need —
   * so all glow in this game goes through here.
   *
   * @param {string} color
   * @param {number} blur
   * @param {() => void} draw
   */
  withGlow(color, blur, draw) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    draw();
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  /** Vertical (top -> bottom) linear gradient. @param {Array<[number,string]>} stops */
  verticalGradient(x, yTop, yBottom, stops) {
    const g = this.ctx.createLinearGradient(x, yTop, x, yBottom);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    return g;
  }

  /** Radial gradient centred on (cx, cy). @param {Array<[number,string]>} stops */
  radialGradient(cx, cy, innerR, outerR, stops) {
    const g = this.ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    return g;
  }
}
