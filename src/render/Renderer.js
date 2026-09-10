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
}
