/**
 * SaveData — persistent progress, backed by a single localStorage key.
 *
 * Everything lives under one JSON blob:
 *   "echoLoop.progress" -> { [levelId]: { stars, echoesUsed, timeMs } }
 *
 * ROBUSTNESS: storage is treated as untrusted and optional. localStorage can
 * be missing (SSR/worker), disabled (Safari private mode throws on write),
 * full (QuotaExceededError), or hold corrupt/hand-edited JSON. None of that
 * may ever break the game, so every entry point is wrapped and falls back to
 * an in-memory store — progress then simply doesn't survive a reload, which
 * is strictly better than a crash on boot. No function here throws.
 */

export const STORAGE_KEY = "echoLoop.progress";
/**
 * Settings live under their OWN key rather than inside the progress blob:
 * getAllProgress() treats every top-level entry as a level record, so a
 * "muted" field in there would be sanitized into a bogus level.
 */
export const SETTINGS_KEY = "echoLoop.settings";

/** Shape returned for a level with no saved record. */
export const EMPTY_RECORD = Object.freeze({
  stars: 0,
  echoesUsed: null,
  timeMs: null,
});

/** Used whenever real localStorage is unavailable. */
const memoryFallback = new Map();
let usingFallback = false;

/** @returns {Storage | null} */
function storage() {
  try {
    if (typeof localStorage === "undefined" || localStorage === null) return null;
    // Probe: some browsers expose localStorage but throw on access/write.
    const probe = "__echoLoop_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function readRaw(key = STORAGE_KEY) {
  const store = storage();
  if (!store) {
    usingFallback = true;
    return memoryFallback.get(key) ?? null;
  }
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  const store = storage();
  if (!store) {
    usingFallback = true;
    memoryFallback.set(key, value);
    return false;
  }
  try {
    store.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded or blocked mid-session: keep the value in memory so the
    // current session still behaves correctly.
    usingFallback = true;
    memoryFallback.set(key, value);
    return false;
  }
}

/** True when progress is only being held in memory (not persisted). */
export function isUsingMemoryFallback() {
  return usingFallback;
}

/** Coerce anything into a valid 0-3 star count. */
function sanitizeStars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.floor(n)));
}

/** Coerce anything into a positive number or null. */
function sanitizeMetric(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * The whole progress object, always a plain object with sane values.
 * @returns {Record<string, {stars:number, echoesUsed:number|null, timeMs:number|null}>}
 */
export function getAllProgress() {
  const raw = readRaw();
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {}; // corrupt JSON: start clean rather than throwing
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  /** @type {Record<string, any>} */
  const clean = {};
  for (const [levelId, record] of Object.entries(parsed)) {
    if (!record || typeof record !== "object") continue;
    clean[levelId] = {
      stars: sanitizeStars(record.stars),
      echoesUsed: sanitizeMetric(record.echoesUsed),
      timeMs: sanitizeMetric(record.timeMs),
    };
  }
  return clean;
}

/**
 * One level's saved record (never null).
 * @param {string} levelId
 */
export function getLevelRecord(levelId) {
  const all = getAllProgress();
  return all[levelId] ?? { ...EMPTY_RECORD };
}

/**
 * Stars saved for a level, 0 if never solved.
 * @param {string} levelId
 * @returns {number} 0-3
 */
export function getLevelStars(levelId) {
  return getLevelRecord(levelId).stars;
}

/**
 * Write a level's star rating, preserving its other saved metrics.
 * @param {string} levelId
 * @param {number} stars 0-3
 * @param {{echoesUsed?: number, timeMs?: number}} [extra]
 * @returns {boolean} true if it reached real persistent storage
 */
export function setLevelStars(levelId, stars, extra = {}) {
  if (!levelId) return false;
  const all = getAllProgress();
  const previous = all[levelId] ?? { ...EMPTY_RECORD };
  all[levelId] = {
    stars: sanitizeStars(stars),
    echoesUsed:
      extra.echoesUsed !== undefined
        ? sanitizeMetric(extra.echoesUsed)
        : previous.echoesUsed,
    timeMs:
      extra.timeMs !== undefined ? sanitizeMetric(extra.timeMs) : previous.timeMs,
  };
  try {
    return writeRaw(STORAGE_KEY, JSON.stringify(all));
  } catch {
    return false;
  }
}

// --- Settings (mute, volume) ------------------------------------------------

const DEFAULT_SETTINGS = Object.freeze({ muted: false, volume: 0.7 });

/**
 * All persisted settings, always a valid object with sane values.
 * @returns {{muted:boolean, volume:number}}
 */
export function getSettings() {
  const raw = readRaw(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_SETTINGS };
  }
  const volume = Number(parsed.volume);
  return {
    muted: parsed.muted === true,
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULT_SETTINGS.volume,
  };
}

/**
 * Merge and persist settings.
 * @param {{muted?:boolean, volume?:number}} patch
 */
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    return writeRaw(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
}

/** @returns {boolean} */
export function getMuted() {
  return getSettings().muted;
}

/** @param {boolean} muted */
export function setMuted(muted) {
  return setSettings({ muted: muted === true });
}

/**
 * Save a completed run, keeping the player's BEST result: stars never go
 * down, and the fewest-echoes / fastest-time metrics are kept independently.
 * Replaying a level for fun can therefore never erase a better rating.
 *
 * @param {string} levelId
 * @param {{stars:number, echoesUsed:number, timeMs:number}} result
 * @returns {{stars:number, echoesUsed:number|null, timeMs:number|null, improved:boolean}}
 */
export function recordLevelResult(levelId, { stars, echoesUsed, timeMs }) {
  const previous = getLevelRecord(levelId);
  const nextStars = Math.max(previous.stars, sanitizeStars(stars));
  const nextEchoes =
    previous.echoesUsed === null
      ? sanitizeMetric(echoesUsed)
      : Math.min(previous.echoesUsed, sanitizeMetric(echoesUsed) ?? Infinity);
  const nextTime =
    previous.timeMs === null
      ? sanitizeMetric(timeMs)
      : Math.min(previous.timeMs, sanitizeMetric(timeMs) ?? Infinity);

  const improved =
    nextStars > previous.stars ||
    previous.echoesUsed === null ||
    (nextEchoes !== null && nextEchoes < previous.echoesUsed) ||
    (nextTime !== null && previous.timeMs !== null && nextTime < previous.timeMs);

  setLevelStars(levelId, nextStars, { echoesUsed: nextEchoes, timeMs: nextTime });
  return { stars: nextStars, echoesUsed: nextEchoes, timeMs: nextTime, improved };
}

/** Total stars across every level (for the level-select header). */
export function getTotalStars() {
  return Object.values(getAllProgress()).reduce((sum, r) => sum + r.stars, 0);
}

/** Wipe all saved progress (settings are kept). */
export function clearProgress() {
  const store = storage();
  memoryFallback.delete(STORAGE_KEY);
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
