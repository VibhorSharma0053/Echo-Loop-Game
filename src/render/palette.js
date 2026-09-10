/**
 * palette.js — one shared source of truth for colors used by BOTH the world
 * renderer and the HUD.
 *
 * The HUD's echo dots must always match the ghost the player sees in the
 * level ("the blue one is holding the switch"), so echo colors live here
 * rather than being duplicated in main.js and HUD.js.
 */

/** Base opacity of an echo ghost in the world. */
export const ECHO_GHOST_ALPHA = 0.55;

/** Echo slot colors, indexed by echo number: #1 blue, #2 purple, #3 gold. */
export const ECHO_COLORS = [
  { solid: "#60a5fa", ghost: "rgba(96, 165, 250, 0.55)", rgb: [96, 165, 250] }, // blue
  { solid: "#a78bfa", ghost: "rgba(167, 139, 250, 0.55)", rgb: [167, 139, 250] }, // purple
  { solid: "#fbbf24", ghost: "rgba(251, 191, 36, 0.55)", rgb: [251, 191, 36] }, // gold
  { solid: "#f472b6", ghost: "rgba(244, 114, 182, 0.55)", rgb: [244, 114, 182] }, // pink
];

export const ECHO_FALLBACK = {
  solid: "#94a3b8",
  ghost: "rgba(148, 163, 184, 0.55)",
  rgb: [148, 163, 184],
};

/** @param {number} index */
export function echoColor(index) {
  return ECHO_COLORS[index] ?? ECHO_FALLBACK;
}

/**
 * An echo's ghost color at a fraction of its normal opacity — used to tween a
 * newly spawned echo in instead of letting it pop.
 * @param {number} index echo slot
 * @param {number} [fade] 0..1
 */
export function echoGhost(index, fade = 1) {
  const [r, g, b] = echoColor(index).rgb;
  const a = ECHO_GHOST_ALPHA * Math.max(0, Math.min(1, fade));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

export const UI = {
  accent: "#22d3ee",
  accentDim: "rgba(34, 211, 238, 0.16)",
  warn: "#f87171",
  good: "#34d399",
  track: "rgba(148, 163, 184, 0.18)",
  slotEmpty: "rgba(148, 163, 184, 0.30)",
  text: "#c7d3e0",
  textDim: "rgba(199, 211, 224, 0.55)",
};
