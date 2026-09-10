/**
 * scoring.js — star rating for a solved level.
 *
 * The rating measures ECONOMY OF ECHOES: the puzzle's intended solution uses
 * `minEchoesForThreeStars`, so hitting that (or beating it) is mastery.
 *
 *   3 stars — solved with at most minEchoesForThreeStars echoes
 *   2 stars — solved with exactly one echo more than that
 *   1 star  — solved at all (any greater number, e.g. the full budget)
 *
 * Solving with zero echoes still awards 3 stars: using fewer than the target
 * is strictly better than the target.
 */

/**
 * @param {object} params
 * @param {number} params.echoesUsed echoes banked when the goal was reached
 * @param {number} params.minEchoesForThreeStars level's three-star target
 * @returns {1|2|3}
 */
export function calculateStars({ echoesUsed, minEchoesForThreeStars }) {
  const used = Number.isFinite(echoesUsed) ? Math.max(0, echoesUsed) : Infinity;
  const target = Number.isFinite(minEchoesForThreeStars)
    ? Math.max(0, minEchoesForThreeStars)
    : 0;

  if (used <= target) return 3;
  if (used <= target + 1) return 2;
  return 1;
}

/**
 * Format elapsed milliseconds as m:ss.d for the UI.
 * @param {number|null} ms
 */
export function formatTime(ms) {
  if (ms === null || !Number.isFinite(ms)) return "--:--";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
