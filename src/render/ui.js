/**
 * ui.js — shared canvas drawing primitives for menus and overlays.
 *
 * Kept separate from HUD.js (which is in-game telemetry) and from the screens
 * themselves, so panels, buttons and star glyphs look identical everywhere.
 */
import { UI } from "./palette.js";

const TAU = Math.PI * 2;

export const FONT_STACK = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

/** @param {CanvasRenderingContext2D} ctx */
export function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
}

/** Rounded-rect path (Path2D-free so it works on every canvas impl). */
export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{fill?:string, stroke?:string, radius?:number, lineWidth?:number, glow?:string}} [style]
 */
export function drawPanel(ctx, x, y, w, h, style = {}) {
  const {
    fill = "rgba(9, 14, 24, 0.92)",
    stroke = "rgba(148, 163, 184, 0.22)",
    radius = 12,
    lineWidth = 1,
    glow = null,
  } = style;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 22;
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** Dim the whole canvas behind an overlay. */
export function drawScrim(ctx, w, h, alpha = 0.72) {
  ctx.save();
  ctx.fillStyle = `rgba(4, 6, 11, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Trace a 5-pointed star centered at (cx, cy). */
export function starPath(ctx, cx, cy, radius) {
  const inner = radius * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * A row of `total` stars, the first `earned` filled gold.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx center x of the row
 * @param {number} cy center y
 * @param {number} earned 0-3
 * @param {{size?:number, gap?:number, total?:number, scales?:number[]}} [options]
 *   scales[i] (0..1) animates individual stars popping in.
 */
export function drawStarRow(ctx, cx, cy, earned, options = {}) {
  const { size = 14, gap = 10, total = 3, scales = null } = options;
  const step = size * 2 + gap;
  const startX = cx - ((total - 1) * step) / 2;

  ctx.save();
  for (let i = 0; i < total; i += 1) {
    const filled = i < earned;
    const scale = scales ? Math.max(0, Math.min(1, scales[i] ?? 1)) : 1;
    if (scale <= 0) continue;
    const x = startX + i * step;
    // Slight overshoot as a star pops in.
    const pop = scale < 1 ? 1 + (1 - scale) * 0.35 : 1;
    starPath(ctx, x, cy, size * scale * pop);
    if (filled) {
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "rgba(251, 191, 36, 0.75)";
      ctx.shadowBlur = 14 * scale;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * A menu button/tile.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number,label:string,disabled?:boolean}} item
 * @param {{focused?:boolean, accent?:string, radius?:number}} [state]
 */
export function drawButton(ctx, item, state = {}) {
  const { focused = false, accent = UI.accent, radius = 10 } = state;
  const disabled = item.disabled === true;

  ctx.save();
  roundRectPath(ctx, item.x, item.y, item.w, item.h, radius);
  ctx.fillStyle = disabled
    ? "rgba(30, 41, 59, 0.45)"
    : focused
      ? "rgba(34, 211, 238, 0.16)"
      : "rgba(30, 41, 59, 0.75)";
  ctx.fill();

  ctx.lineWidth = focused && !disabled ? 2 : 1;
  ctx.strokeStyle = disabled
    ? "rgba(148, 163, 184, 0.18)"
    : focused
      ? accent
      : "rgba(148, 163, 184, 0.3)";
  if (focused && !disabled) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  font(ctx, 13, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled
    ? "rgba(148, 163, 184, 0.4)"
    : focused
      ? "#e8f6fb"
      : UI.text;
  ctx.fillText(item.label, item.x + item.w / 2, item.y + item.h / 2 + 1);
  ctx.restore();
}

/** Centered text helper. */
export function drawText(ctx, text, x, y, { size = 12, weight = 400, color = UI.text, align = "center", letterSpacing = null } = {}) {
  ctx.save();
  font(ctx, size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  if (letterSpacing && "letterSpacing" in ctx) ctx.letterSpacing = letterSpacing;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Small circular dot row (echo budget preview on level tiles). */
export function drawDots(ctx, x, y, count, color, radius = 3, gap = 9) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    ctx.arc(x + i * gap, y, radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
