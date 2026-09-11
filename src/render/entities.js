/**
 * entities.js — procedural artwork for the four "readable" game objects:
 * the player/echoes, pressure plates, doors, and the goal portal.
 *
 * Everything is drawn with Canvas 2D primitives (roundRect, arc, gradients,
 * shadow glow, alpha) — there are no image assets anywhere in this project.
 *
 * These functions are pure drawing: they receive geometry plus already-
 * interpolated visual values (press amount, door open amount, elapsed time)
 * and never touch simulation state.
 */
import { echoColor } from "./palette.js";

const TAU = Math.PI * 2;

export const ENTITY_COLORS = {
  // Player: a warm near-white with a cyan halo. Deliberately brighter and
  // less saturated than any echo hue so it always reads as "the live one".
  playerCore: "#f4fbff",
  playerEdge: "#bfe9ff",
  playerGlow: "rgba(125, 211, 252, 0.95)",

  // Plates.
  plateHousing: "#2b3444",
  plateHousingEdge: "#586274",
  plateIdle: "#f59e0b",
  plateIdleHi: "#fcd34d",
  plateLiveOnly: "#fb7185", // plates echoes cannot press
  plateLiveOnlyHi: "#fda4af",
  plateActive: "#34d399",
  plateActiveHi: "#a7f3d0",

  // Doors.
  doorFrame: "#475569",
  doorFrameHi: "#94a3b8",
  doorSealedTop: "#f0563f",
  doorSealedBottom: "#6f1616",
  doorPanelLine: "rgba(0, 0, 0, 0.28)",
  doorPanelHi: "rgba(255, 255, 255, 0.16)",
  doorwayTop: "#0a1220",
  doorwayBottom: "#05080f",
  doorOpenGlow: "rgba(52, 211, 153, 0.9)",
  doorSealGlow: "rgba(239, 68, 68, 0.85)",

  // Portal.
  portalCore: "#eaffff",
  portalMid: "#22d3ee",
  portalEdge: "#4c1d95",
  portalRing: "rgba(186, 245, 255, 0.85)",
  portalGlow: "rgba(34, 211, 238, 0.9)",
};

// ---------------------------------------------------------------------------
// Player + echoes
// ---------------------------------------------------------------------------

/**
 * Draw a character body (the live player or an echo) as a rounded rect.
 *
 * @param {import("./Renderer.js").Renderer} r
 * @param {{x:number,y:number,w:number,h:number}} body
 * @param {object} [options]
 * @param {boolean} [options.isEcho]
 * @param {number} [options.echoIndex] slot colour for echoes
 * @param {number} [options.alpha] overall opacity (echo fade-in)
 * @param {number} [options.facing] 1 right, -1 left (live player only)
 * @param {{sx:number, sy:number}} [options.scale] render-only squash/stretch
 */
export function drawCharacter(r, body, options = {}) {
  const {
    isEcho = false,
    echoIndex = 0,
    alpha = 1,
    facing = 1,
    scale = { sx: 1, sy: 1 },
  } = options;

  if (alpha <= 0.001) return;

  const ctx = r.ctx;
  const x = Math.round(body.x);
  const y = Math.round(body.y);
  const w = body.w;
  const h = body.h;
  const radius = 7;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Squash/stretch is anchored at the feet so a landing pose never sinks the
  // character into the floor. This is a canvas transform only — the collision
  // box passed in is untouched.
  if (scale.sx !== 1 || scale.sy !== 1) {
    const cx = x + w / 2;
    const feet = y + h;
    ctx.translate(cx, feet);
    ctx.scale(scale.sx, scale.sy);
    ctx.translate(-cx, -feet);
  }

  if (isEcho) {
    // Echoes: same silhouette, but flat and translucent — a memory, not a
    // competitor for attention. No glow at all.
    const [cr, cg, cb] = echoColor(echoIndex).rgb;
    const ghostFill = r.verticalGradient(x, y, y + h, [
      [0, `rgba(${cr}, ${cg}, ${cb}, 0.50)`],
      [1, `rgba(${cr}, ${cg}, ${cb}, 0.30)`],
    ]);
    r.fillRoundRect(x, y, w, h, radius, ghostFill);
    r.strokeRoundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius, `rgba(${cr}, ${cg}, ${cb}, 0.75)`, 1);
  } else {
    // Live player: bright, softly glowing, with a highlight so it reads as
    // lit rather than flat.
    r.withGlow(ENTITY_COLORS.playerGlow, 11, () => {
      const fill = r.verticalGradient(x, y, y + h, [
        [0, ENTITY_COLORS.playerCore],
        [1, ENTITY_COLORS.playerEdge],
      ]);
      r.fillRoundRect(x, y, w, h, radius, fill);
    });

    // Inner top highlight.
    ctx.globalAlpha = alpha * 0.55;
    r.fillRoundRect(x + 3, y + 2.5, w - 6, h * 0.34, 4, "rgba(255, 255, 255, 0.85)");
    ctx.globalAlpha = alpha;

    // Facing indicator: a small dart near the leading edge. Cosmetic only.
    const cy = y + h * 0.56;
    const edge = facing >= 0 ? x + w - 5.5 : x + 5.5;
    const dir = facing >= 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(edge + dir * 3, cy);
    ctx.lineTo(edge - dir * 2.2, cy - 3.4);
    ctx.lineTo(edge - dir * 2.2, cy + 3.4);
    ctx.closePath();
    ctx.fillStyle = "rgba(14, 42, 66, 0.72)";
    ctx.fill();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pressure plates
// ---------------------------------------------------------------------------

/**
 * Draw a plate as an obviously pressable button: a dark housing with a raised
 * cap that sinks into it while held.
 *
 * @param {import("./Renderer.js").Renderer} r
 * @param {{x:number,y:number,w:number,h:number,echoesCanActivate:boolean}} sw
 * @param {number} press 0 (up) .. 1 (fully depressed)
 * @param {number} time seconds, for the idle shimmer
 */
export function drawSwitch(r, sw, press, time) {
  const ctx = r.ctx;
  const x = sw.x;
  const y = sw.y;
  const w = sw.w;
  const h = sw.h;

  const TRAVEL = 5; // px the cap sinks — matches the "4-6px" brief
  const capH = Math.max(8, h - 4);
  const capInset = 7;
  const capY = y + press * TRAVEL;

  const liveOnly = sw.echoesCanActivate === false;
  const base = press > 0.5
    ? ENTITY_COLORS.plateActive
    : liveOnly
      ? ENTITY_COLORS.plateLiveOnly
      : ENTITY_COLORS.plateIdle;
  const hi = press > 0.5
    ? ENTITY_COLORS.plateActiveHi
    : liveOnly
      ? ENTITY_COLORS.plateLiveOnlyHi
      : ENTITY_COLORS.plateIdleHi;

  ctx.save();

  // Housing: the socket the cap travels inside.
  r.fillRoundRect(x, y + 3, w, h - 3, 4, ENTITY_COLORS.plateHousing);
  r.strokeRoundRect(x + 0.5, y + 3.5, w - 1, h - 4, 4, ENTITY_COLORS.plateHousingEdge, 1);

  // Glow ring under the cap: gentle when idle, strong and steady when active.
  const idlePulse = 0.45 + 0.2 * Math.sin(time * 2.4);
  const glowAlpha = press > 0.5 ? 0.95 : idlePulse;
  const glowBlur = press > 0.5 ? 14 : 8;
  ctx.globalAlpha = glowAlpha;
  r.withGlow(base, glowBlur, () => {
    r.fillRoundRect(x + capInset, capY, w - capInset * 2, capH, 5, base);
  });
  ctx.globalAlpha = 1;

  // Cap face, shaded top-to-bottom so it looks physically raised.
  const capFill = r.verticalGradient(x, capY, capY + capH, [
    [0, hi],
    [1, base],
  ]);
  r.fillRoundRect(x + capInset, capY, w - capInset * 2, capH, 5, capFill);

  // Specular line along the top of the cap; it dims as the cap sinks.
  ctx.globalAlpha = 0.75 * (1 - press * 0.8);
  r.fillRoundRect(x + capInset + 4, capY + 1.5, w - capInset * 2 - 8, 2, 1, "rgba(255,255,255,0.9)");
  ctx.globalAlpha = 1;

  // Centre pip — a little "button" affordance in the middle of the cap.
  const cx = x + w / 2;
  const cy = capY + capH / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(3.4, capH * 0.3), 0, TAU);
  ctx.fillStyle = press > 0.5 ? "rgba(6, 40, 30, 0.55)" : "rgba(60, 30, 0, 0.42)";
  ctx.fill();

  ctx.restore();
}

/**
 * A dashed "circuit" line from an active plate to the door it opens, so the
 * cause and effect is obvious on multi-switch levels.
 *
 * Only drawn while the plate is actually held, to keep the screen quiet.
 *
 * @param {import("./Renderer.js").Renderer} r
 * @param {{x:number,y:number,w:number}} sw
 * @param {{x:number,y:number,w:number,h:number}} door
 * @param {number} time seconds
 * @param {number} strength 0..1 fade-in with the plate press
 */
export function drawLinkLine(r, sw, door, time, strength) {
  if (strength <= 0.02) return;
  const ctx = r.ctx;
  const x1 = sw.x + sw.w / 2;
  const y1 = sw.y - 2;
  const x2 = door.x + door.w / 2;
  const y2 = door.y + door.h - 10;

  ctx.save();
  ctx.globalAlpha = 0.3 * strength;
  ctx.strokeStyle = ENTITY_COLORS.plateActive;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  // Negative offset makes the dashes crawl from plate toward door.
  ctx.lineDashOffset = -(time * 34) % 12;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // A bright mote riding the line, reinforcing the direction of causality.
  const t = (time * 0.55) % 1;
  ctx.globalAlpha = 0.85 * strength * Math.sin(t * Math.PI);
  ctx.beginPath();
  ctx.arc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 2.6, 0, TAU);
  ctx.fillStyle = ENTITY_COLORS.plateActiveHi;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

/**
 * Draw a door as a framed doorway with a sliding panel.
 *
 * The frame is always visible in both states, so the player can see "there is
 * a doorway here" even while it stands open. `openAmount` is a render-only
 * interpolation — collision still flips on the exact tick it always did.
 *
 * @param {import("./Renderer.js").Renderer} r
 * @param {{x:number,y:number,w:number,h:number}} door
 * @param {number} openAmount 0 (sealed) .. 1 (fully open)
 * @param {number} time seconds
 */
export function drawDoor(r, door, openAmount, time) {
  const ctx = r.ctx;
  const { x, y, w, h } = door;
  const FRAME = 3.5;
  const ix = x + FRAME;
  const iy = y + FRAME;
  const iw = w - FRAME * 2;
  const ih = h - FRAME * 2;

  ctx.save();

  // --- the empty doorway behind the panel --------------------------------
  const shaft = r.verticalGradient(x, iy, iy + ih, [
    [0, ENTITY_COLORS.doorwayTop],
    [1, ENTITY_COLORS.doorwayBottom],
  ]);
  ctx.fillStyle = shaft;
  ctx.fillRect(ix, iy, iw, ih);

  // --- the sliding panel --------------------------------------------------
  if (openAmount < 0.999 && iw > 0 && ih > 0) {
    ctx.save();
    // Clip to the doorway so the panel visibly retracts *into* the frame.
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();

    const slide = openAmount * ih; // panel rises out of view
    const py = iy - slide;

    const panel = r.verticalGradient(ix, py, py + ih, [
      [0, ENTITY_COLORS.doorSealedTop],
      [0.55, "#c02f22"],
      [1, ENTITY_COLORS.doorSealedBottom],
    ]);
    ctx.fillStyle = panel;
    ctx.fillRect(ix, py, iw, ih);

    // Mechanical panel lines, spaced down the shutter.
    const lines = 4;
    for (let i = 1; i <= lines; i += 1) {
      const ly = Math.round(py + (ih * i) / (lines + 1));
      ctx.fillStyle = ENTITY_COLORS.doorPanelLine;
      ctx.fillRect(ix, ly, iw, 2);
      ctx.fillStyle = ENTITY_COLORS.doorPanelHi;
      ctx.fillRect(ix, ly + 2, iw, 1);
    }

    // Vertical seam highlight down the middle of the shutter.
    ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
    ctx.fillRect(ix + iw / 2 - 1, py, 2, ih);

    // Slow "sealed" pulse (~2s) so a closed door reads as actively held shut.
    const seal = (0.5 + 0.5 * Math.sin(time * Math.PI)) * (1 - openAmount);
    ctx.globalAlpha = 0.12 + seal * 0.2;
    ctx.fillStyle = "#ff8f7a";
    ctx.fillRect(ix, py, iw, ih);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // --- frame (always drawn, in both states) --------------------------------
  const glowColor =
    openAmount > 0.02 ? ENTITY_COLORS.doorOpenGlow : ENTITY_COLORS.doorSealGlow;
  const sealPulse = 0.5 + 0.5 * Math.sin(time * Math.PI);
  const glowStrength =
    openAmount > 0.02
      ? 0.55 + 0.45 * openAmount
      : 0.25 + 0.35 * sealPulse;

  ctx.globalAlpha = glowStrength;
  r.withGlow(glowColor, 12, () => {
    r.strokeRoundRect(x + FRAME / 2, y + FRAME / 2, w - FRAME, h - FRAME, 3, glowColor, FRAME);
  });
  ctx.globalAlpha = 1;

  // Solid steel frame over the glow.
  const frameFill = r.verticalGradient(x, y, y + h, [
    [0, ENTITY_COLORS.doorFrameHi],
    [0.5, ENTITY_COLORS.doorFrame],
    [1, "#334155"],
  ]);
  ctx.strokeStyle = frameFill;
  ctx.lineWidth = FRAME;
  r.roundRectPath(x + FRAME / 2, y + FRAME / 2, w - FRAME, h - FRAME, 3);
  ctx.stroke();

  // Chunky head and sill caps, so it reads as a doorway rather than a pane.
  ctx.fillStyle = ENTITY_COLORS.doorFrame;
  ctx.fillRect(x - 2, y - 3, w + 4, 6);
  ctx.fillRect(x - 2, y + h - 3, w + 4, 6);
  ctx.fillStyle = ENTITY_COLORS.doorFrameHi;
  ctx.fillRect(x - 2, y - 3, w + 4, 1.5);
  ctx.fillRect(x - 2, y + h - 3, w + 4, 1.5);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Goal portal
// ---------------------------------------------------------------------------

/**
 * Draw the goal as a glowing portal: radial energy core, counter-rotating
 * rings, pulsing halo, and a few rising motes.
 *
 * Purely decorative and driven by elapsed real time — nothing here is part of
 * the simulation, so it cannot affect echo replay.
 *
 * @param {import("./Renderer.js").Renderer} r
 * @param {{x:number,y:number,w:number,h:number}} goal
 * @param {number} time seconds
 * @param {Array<{x:number,y:number,life:number,ttl:number,r:number}>} particles
 */
export function drawGoalPortal(r, goal, time, particles = []) {
  const ctx = r.ctx;
  const cx = goal.x + goal.w / 2;
  const cy = goal.y + goal.h / 2;
  const rx = goal.w / 2;
  const ry = goal.h / 2;
  const radius = Math.max(rx, ry);

  // ~1.7s breathing cycle on the halo.
  const pulse = 0.5 + 0.5 * Math.sin((time * TAU) / 1.7);

  ctx.save();

  // Outer halo.
  // Blur radius is kept modest on purpose: shadowBlur cost scales with the
  // radius, and this is the only glow that animates its size every frame.
  ctx.globalAlpha = 0.5 + pulse * 0.4;
  r.withGlow(ENTITY_COLORS.portalGlow, 11 + pulse * 6, () => {
    r.fillRoundRect(goal.x, goal.y, goal.w, goal.h, 10, "rgba(34, 211, 238, 0.16)");
  });
  ctx.globalAlpha = 1;

  // Energy core: bright white-cyan centre out to a deep violet rim.
  const core = r.radialGradient(cx, cy, 1, radius * 1.06, [
    [0, ENTITY_COLORS.portalCore],
    [0.28, ENTITY_COLORS.portalMid],
    [0.72, "#1d4ed8"],
    [1, ENTITY_COLORS.portalEdge],
  ]);
  ctx.globalAlpha = 0.9;
  r.fillRoundRect(goal.x, goal.y, goal.w, goal.h, 10, core);
  ctx.globalAlpha = 1;

  // Swirling rings: concentric rounded rects counter-rotating in an ellipse.
  ctx.save();
  ctx.beginPath();
  r.roundRectPath(goal.x, goal.y, goal.w, goal.h, 10);
  ctx.clip(); // keep the swirl inside the portal mouth

  ctx.translate(cx, cy);
  for (let i = 0; i < 3; i += 1) {
    const dir = i % 2 === 0 ? 1 : -1;
    const spin = time * (0.5 + i * 0.22) * dir;
    const scale = 0.78 - i * 0.19;
    ctx.save();
    ctx.rotate(spin);
    ctx.globalAlpha = 0.32 + 0.22 * Math.sin(time * 1.6 + i);
    ctx.strokeStyle = ENTITY_COLORS.portalRing;
    ctx.lineWidth = 1.6;
    r.roundRectPath(
      -rx * scale,
      -ry * scale,
      rx * 2 * scale,
      ry * 2 * scale,
      Math.min(rx, ry) * scale * 0.55,
    );
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Rising motes.
  for (const p of particles) {
    const k = p.life / p.ttl;
    if (k >= 1) continue;
    // Fade in then out across the lifetime.
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fillStyle = "#d6fbff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Crisp rim so the portal still has a definite edge against the background.
  r.strokeRoundRect(goal.x + 1, goal.y + 1, goal.w - 2, goal.h - 2, 9, "rgba(190, 250, 255, 0.75)", 2);

  ctx.restore();
}
