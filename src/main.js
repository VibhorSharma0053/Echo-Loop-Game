/**
 * Echo Loop — Phase 5 entry point.
 *
 * Adds screens and persistence on top of the Phase 4 game:
 *
 *   "select"   level-select grid, star ratings loaded from localStorage
 *   "playing"  the simulation + HUD
 *   "complete" win overlay drawn over the frozen level
 *
 * A single `gameState` string drives which screen receives input, which
 * updates, and what renders. The simulation only ticks in "playing".
 */
import { Renderer } from "./render/Renderer.js";
import { HUD } from "./render/HUD.js";
import { echoGhost, UI } from "./render/palette.js";
import { GameLoop, FIXED_DT } from "./game/GameLoop.js";
import { Input } from "./game/Input.js";
import { Player } from "./game/Player.js";
import { Level } from "./game/Level.js";
import { LoopManager } from "./game/LoopManager.js";
import { resolveAABBCollision, resolveOneWayTop } from "./game/Physics.js";
import { LEVELS } from "./game/levels/levelData.js";
import { calculateStars } from "./game/scoring.js";
import {
  getLevelStars,
  recordLevelResult,
  getSettings,
  setMuted,
} from "./storage/SaveData.js";
import { AudioManager } from "./audio/AudioManager.js";
import { MainMenuScreen } from "./screens/MainMenuScreen.js";
import { LevelSelectScreen } from "./screens/LevelSelectScreen.js";
import { LevelCompleteScreen } from "./screens/LevelCompleteScreen.js";

// --- Boot -------------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement | null} */ (
  document.getElementById("game")
);
if (!canvas) {
  throw new Error('[echo-loop] <canvas id="game"> not found in document.');
}
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("[echo-loop] CanvasRenderingContext2D is unavailable.");
}
const renderer = new Renderer(ctx);
const WORLD = { width: canvas.width, height: canvas.height };
const hud = new HUD(ctx, WORLD);

const COLORS = {
  solid: "#525c6b",
  plate: "#facc15",
  platePressed: "#fef08a",
  plateLiveOnly: "#fb923c",
  doorClosed: "#ef4444",
  doorOpen: "rgba(34, 197, 94, 0.3)",
  doorFrame: "#22c55e",
  goal: "rgba(45, 212, 191, 0.28)",
  goalFrame: "#2dd4bf",
  player: "#ffffff",
  platform: "#8595ad",
  platformEdge: "#f59e0b",
};

// --- Game state -------------------------------------------------------------

/**
 * Screen flow: menu -> select -> playing -> complete -> (select | playing).
 * @type {"menu"|"select"|"playing"|"complete"}
 */
let gameState = "menu";

const input = new Input();
input.attach();

// Audio: procedurally synthesised, muted state restored from localStorage.
// attach() only registers gesture listeners — the AudioContext itself is
// created on the player's first click/keypress, as browsers require.
const audio = new AudioManager({
  muted: getSettings().muted,
  volume: getSettings().volume,
});
audio.attach();

/**
 * @type {{ level: Level, player: Player, loopManager: LoopManager,
 *          solved: boolean, index: number } | null}
 */
let session = null;

/** Entities that can press plates: the live player plus every echo. */
function entities() {
  return session ? [session.player, ...session.loopManager.echoes] : [];
}

/**
 * Per-echo 0..1 opacity tween, so a newly banked echo fades in over ~200ms
 * instead of popping into existence at the same instant as the rewind flash.
 * Purely presentational; parallel to loopManager.echoes and only ever grows.
 * @type {number[]}
 */
let echoFades = [];
const ECHO_FADE_SECONDS = 0.2;

/** @param {number} frameDt real seconds */
function advanceEchoFades(frameDt) {
  const count = session ? session.loopManager.echoes.length : 0;
  while (echoFades.length < count) echoFades.push(0);
  for (let i = 0; i < echoFades.length; i += 1) {
    if (echoFades[i] < 1) {
      echoFades[i] = Math.min(1, echoFades[i] + frameDt / ECHO_FADE_SECONDS);
    }
  }
}

/** Elapsed simulated time this attempt, derived from ticks (deterministic). */
function elapsedMs(loopManager, loopDurationTicks) {
  const ticks = loopManager.loopIndex * loopDurationTicks + loopManager.currentTick;
  return ticks * FIXED_DT * 1000;
}

// --- Screens ----------------------------------------------------------------

const mainMenu = new MainMenuScreen(
  ctx,
  WORLD,
  (action) => {
    if (action === "play") openLevelSelect(0);
    else if (action === "mute") toggleMute();
  },
  () => audio.muted,
  LEVELS.length,
);

const levelSelect = new LevelSelectScreen(ctx, WORLD, LEVELS, (index) => {
  startLevel(index);
});

const levelComplete = new LevelCompleteScreen(ctx, WORLD, (action) => {
  if (!session) return;
  if (action === "retry") startLevel(session.index);
  else if (action === "next") startLevel(session.index + 1);
  else openLevelSelect(session.index);
});

/** Return to the title screen. */
function openMainMenu() {
  gameState = "menu";
  session = null;
  input.clearHeldKeys();
  audio.stopAmbient();
  mainMenu.open();
  updateCaption();
}

/** Mute toggle shared by the M key, the HUD speaker, and the menu button. */
function toggleMute() {
  const muted = audio.toggleMute();
  setMuted(muted);
  // Re-seat the bed so unmuting mid-level brings the pad straight back.
  if (!muted && gameState === "playing") audio.startAmbient();
  mainMenu.syncLabels();
  updateCaption();
  return muted;
}

/** @param {number} focusIndex tile to highlight when the grid opens */
function openLevelSelect(focusIndex = 0) {
  gameState = "select";
  session = null;
  input.clearHeldKeys();
  audio.stopAmbient(); // the bed belongs to gameplay only
  levelSelect.open(focusIndex);
  updateCaption();
}

// --- Level lifecycle --------------------------------------------------------

/**
 * Resolve one moved entity against the level's current solids. Shared by the
 * live player and all echoes so they obey identical rules. Open doors are
 * simply absent from getSolids(), which is what makes them passable.
 */
function makeCollisionResolver(level) {
  return function resolveCollisions(entity) {
    // Riding is re-established from scratch every tick: gravity re-seats a
    // resting entity onto its platform each step, so a "top" contact with a
    // moving platform is a reliable per-tick test for "standing on it".
    entity.ridingId = null;
    for (const solid of level.getSolids()) {
      // Moving platforms are one-way (solid from above) so a descending deck
      // can never crush or eject a standing entity — see resolveOneWayTop.
      const hit = solid.isMovingPlatform
        ? resolveOneWayTop(entity, solid)
        : resolveAABBCollision(entity, solid);
      if (hit === "top") {
        entity.grounded = true;
        if (solid.isMovingPlatform) entity.ridingId = solid.id;
      }
    }
    // Keep entities inside the canvas until real level bounds exist.
    if (entity.x < 0) {
      entity.x = 0;
      if (entity.vx < 0) entity.vx = 0;
    }
    const maxX = WORLD.width - entity.w;
    if (entity.x > maxX) {
      entity.x = maxX;
      if (entity.vx > 0) entity.vx = 0;
    }
  };
}

/** Score, persist, and show the win overlay. */
function completeLevel() {
  const { level, loopManager, index } = session;
  const echoesUsed = loopManager.echoes.length;
  const timeMs = elapsedMs(loopManager, level.loopDurationTicks);
  const stars = calculateStars({
    echoesUsed,
    minEchoesForThreeStars: level.minEchoesForThreeStars,
  });

  // Persist immediately, keeping the player's best-ever result.
  const saved = recordLevelResult(level.id, { stars, echoesUsed, timeMs });

  gameState = "complete";
  input.clearHeldKeys();
  // The bed steps aside so the fanfare lands cleanly.
  audio.stopAmbient();
  audio.solved();
  levelComplete.open({
    levelId: level.id,
    stars,
    echoesUsed,
    timeMs,
    loops: loopManager.loopIndex + 1,
    bestStars: saved.stars,
    isNewBest: saved.improved,
    hasNextLevel: index + 1 < LEVELS.length,
    minEchoesForThreeStars: level.minEchoesForThreeStars,
  });
  updateCaption();

  console.log(
    `[echo-loop] ${level.id} solved — ${stars}★ with ${echoesUsed} echo(es) ` +
      `in ${(timeMs / 1000).toFixed(1)}s (target ${level.minEchoesForThreeStars}).`,
  );
}

/**
 * Load a level by array index and begin playing it from loop 1.
 * @param {number} index
 */
function startLevel(index) {
  const data = LEVELS[index];
  if (!data) {
    console.warn(`[echo-loop] No level at index ${index}.`);
    openLevelSelect();
    return;
  }

  const level = new Level(data);
  const player = new Player(level.playerStart.x, level.playerStart.y);

  const loopManager = new LoopManager({
    player,
    input,
    spawn: level.playerStart,
    loopDurationTicks: level.loopDurationTicks,
    maxEchoes: level.maxEchoes,
    resolveCollisions: makeCollisionResolver(level),
    level, // LoopManager calls level.reset() on every loop boundary
    onBeforeStep: (tick) => {
      // Platforms advance from the LOOP TICK (never elapsed time), then carry
      // their riders, so the world is identical at tick N of every loop and
      // echoes meet platforms exactly where they did when recording.
      level.updatePlatforms(tick);
      level.carryRiders(entities());
    },
    onAfterStep: () => {
      level.updateSwitches(entities());

      // --- audio cues (presentation only; never read back by the sim) ---
      // The live player is louder than echoes, so the ghosts stay secondary.
      if (player.jumpedThisTick) audio.jump(1);
      else if (loopManager.echoes.some((e) => e.jumpedThisTick)) audio.jump(0.4);
      if (level.switches.some((sw) => sw.justPressed)) audio.switchOn();

      if (!session.solved && level.isGoalReached(player)) {
        session.solved = true;
        completeLevel();
        return true; // halt the loop clock so the win survives the last tick
      }
      return false;
    },
    onLoopEnd: ({ loopIndex, echoCount, echoAdded, reason }) => {
      // Every reset — natural timeout AND quick-restart — flashes, so the
      // rewind always reads. Aborts flash warm/red, banked loops flash cyan.
      hud.triggerFlash(reason === "abort" ? UI.warn : UI.accent);
      // Warm chime on every rewind — timeout and quick-restart alike.
      audio.loopReset();
      // Doors/plates were reset by LoopManager; recompute the visual state so
      // the first rendered frame after a reset is already correct.
      level.updateSwitches(entities());
      console.log(
        `[echo-loop] ${level.id} loop ${loopIndex} ${
          reason === "abort" ? "aborted" : "complete"
        } — ${echoAdded ? "new echo recorded" : "no echo added"}; ` +
          `${echoCount}/${level.maxEchoes} echoes active.`,
      );
    },
  });

  session = { level, player, loopManager, solved: false, index };
  echoFades = [];
  level.reset();
  level.updateSwitches(entities());

  gameState = "playing";
  // The Enter/Space that picked this level is probably still held; ignore it
  // until released so it can't register as a jump on the very first tick.
  input.suppressHeldKeys();
  hud.triggerFlash(UI.accent);
  audio.startAmbient();
  updateCaption();
}

/** Restart the whole level from scratch (wipes every banked echo). */
function restartLevel() {
  if (!session) return;
  startLevel(session.index);
  hud.triggerFlash(UI.warn);
}

/**
 * Quick-restart: end the current attempt right now instead of waiting out the
 * timer. Banked echoes are kept and keep replaying; only the in-progress
 * recording is thrown away (see LoopManager.abortLoop for why an aborted
 * attempt must never become an echo).
 */
function quickRestart() {
  if (!session) return;
  session.loopManager.abortLoop(); // fires onLoopEnd -> flash + switch refresh
}

// --- Input routing ----------------------------------------------------------

/** Map a mouse/touch event to logical canvas coordinates (CSS-scaled). */
function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener("mousemove", (event) => {
  const { x, y } = canvasPoint(event);
  if (gameState === "menu") mainMenu.pointerMove(x, y);
  else if (gameState === "select") levelSelect.pointerMove(x, y);
  else if (gameState === "complete") levelComplete.pointerMove(x, y);
});

canvas.addEventListener("mousedown", (event) => {
  const { x, y } = canvasPoint(event);

  // The HUD speaker icon is clickable whenever the HUD is on screen.
  if (gameState === "playing" || gameState === "complete") {
    const r = hud.soundIconRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      toggleMute();
      return;
    }
  }

  if (gameState === "menu") mainMenu.pointerDown(x, y);
  else if (gameState === "select") levelSelect.pointerDown(x, y);
  else if (gameState === "complete") levelComplete.pointerDown(x, y);
});

// Session controls, deliberately outside the Input action abstraction: these
// are UI/session commands, not character actions an echo could ever replay.
window.addEventListener("keydown", (event) => {
  // M toggles mute from any screen, and the preference persists.
  if (event.code === "KeyM") {
    event.preventDefault();
    toggleMute();
    return;
  }

  if (gameState === "menu") {
    if (mainMenu.handleKey(event)) event.preventDefault();
    return;
  }

  if (gameState === "select") {
    // Esc backs out of the grid to the title screen.
    if (event.code === "Escape") {
      event.preventDefault();
      openMainMenu();
      return;
    }
    if (levelSelect.handleKey(event)) event.preventDefault();
    return;
  }

  if (gameState === "complete") {
    if (levelComplete.handleKey(event)) event.preventDefault();
    return;
  }

  // --- playing ---
  if (event.code === "Escape") {
    event.preventDefault();
    openLevelSelect(session ? session.index : 0);
    return;
  }
  if (event.code === "KeyR") {
    event.preventDefault();
    if (event.shiftKey) restartLevel();
    else quickRestart();
  }
});

/** Level readout in the DOM caption below the canvas. */
function updateCaption() {
  const label = document.getElementById("level-label");
  const status = document.getElementById("level-status");
  const sound = document.getElementById("sound-state");
  if (sound) {
    sound.textContent = audio.muted ? "muted" : "sound on";
    sound.style.color = audio.muted ? "#f87171" : "";
  }
  if (label) label.textContent = session ? session.level.id : "—";
  if (!status) return;
  if (gameState === "menu") {
    status.textContent = "title";
    status.style.color = "";
  } else if (gameState === "select") {
    status.textContent = "level select";
    status.style.color = "";
  } else if (gameState === "complete") {
    status.textContent = `solved · ${getLevelStars(session.level.id)}★`;
    status.style.color = "#34d399";
  } else {
    status.textContent = "running";
    status.style.color = "";
  }
}

// --- Simulation tick (fixed 60Hz) -------------------------------------------

function tick(fixedDt) {
  // Only the playing state advances the simulation; menus never do.
  if (gameState !== "playing" || !session || session.solved) return;
  session.loopManager.tick(fixedDt);
}

// --- Render (once per frame) -------------------------------------------------

/** Real (wall-clock) seconds since the previous frame, for UI animation. */
let lastFrameMs = performance.now();

function render() {
  // UI animations run on real frame time, not simulation ticks, so fades last
  // the same duration no matter how many fixed steps ran this frame.
  const now = performance.now();
  const frameDt = Math.min((now - lastFrameMs) / 1000, 0.1);
  lastFrameMs = now;
  hud.update(frameDt);
  advanceEchoFades(frameDt);

  if (gameState === "menu") {
    mainMenu.update(frameDt);
    mainMenu.draw();
    return;
  }

  if (gameState === "select") {
    levelSelect.update(frameDt);
    levelSelect.draw();
    return;
  }

  drawWorld();

  // Flash first so it washes over the level but never dims the HUD widgets.
  hud.drawFlash();
  hud.draw({
    currentTick: session.loopManager.currentTick,
    loopDurationTicks: session.level.loopDurationTicks,
    echoCount: session.loopManager.echoes.length,
    maxEchoes: session.level.maxEchoes,
    levelId: session.level.id,
    solved: session.solved,
    muted: audio.muted,
  });

  if (gameState === "complete") {
    levelComplete.update(frameDt);
    levelComplete.draw();
  }
}

/** Draw the level, echoes and player. */
function drawWorld() {
  const { level, player, loopManager } = session;
  renderer.clear();

  for (const g of level.geometry) {
    renderer.drawRect(g.x, g.y, g.w, g.h, COLORS.solid);
  }

  // Goal: translucent teal field with a bright frame.
  const goal = level.goal;
  renderer.drawRect(goal.x, goal.y, goal.w, goal.h, COLORS.goal);
  renderer.drawRect(goal.x, goal.y, goal.w, 4, COLORS.goalFrame);
  renderer.drawRect(goal.x, goal.y + goal.h - 4, goal.w, 4, COLORS.goalFrame);
  renderer.drawRect(goal.x, goal.y, 4, goal.h, COLORS.goalFrame);
  renderer.drawRect(goal.x + goal.w - 4, goal.y, 4, goal.h, COLORS.goalFrame);

  for (const sw of level.switches) {
    const color = sw.pressed
      ? COLORS.platePressed
      : sw.echoesCanActivate
        ? COLORS.plate
        : COLORS.plateLiveOnly;
    // Pressed plates visibly sink a couple of pixels.
    const sink = sw.pressed ? 3 : 0;
    renderer.drawRect(sw.x, sw.y + sink, sw.w, sw.h - sink, color);
  }

  for (const door of level.doors) {
    if (door.open) {
      renderer.drawRect(door.x, door.y, door.w, door.h, COLORS.doorOpen);
      renderer.drawRect(door.x, door.y, door.w, 4, COLORS.doorFrame);
      renderer.drawRect(door.x, door.y + door.h - 4, door.w, 4, COLORS.doorFrame);
    } else {
      renderer.drawRect(door.x, door.y, door.w, door.h, COLORS.doorClosed);
    }
  }

  // Moving platforms: steel decks with a warm top edge so they read as
  // "machinery" rather than static level geometry.
  for (const mp of level.movingPlatforms) {
    const px = Math.round(mp.x);
    const py = Math.round(mp.y);
    renderer.drawRect(px, py, mp.w, mp.h, COLORS.platform);
    renderer.drawRect(px, py, mp.w, 3, COLORS.platformEdge);
  }

  // Echoes under the live player, so the player is never hidden. Colors come
  // from the shared palette, so each ghost matches its HUD dot exactly.
  for (const echo of loopManager.echoes) {
    renderer.drawRect(
      Math.round(echo.x),
      Math.round(echo.y),
      echo.w,
      echo.h,
      echoGhost(echo.index, echoFades[echo.index] ?? 1),
    );
  }

  renderer.drawRect(
    Math.round(player.x),
    Math.round(player.y),
    player.w,
    player.h,
    COLORS.player,
  );
}

// --- Go ---------------------------------------------------------------------

openMainMenu();
console.log(
  "[echo-loop] Keys — menus: arrows + enter (or click). " +
    "In game: R retry loop, Shift+R full restart, Esc level select. M mutes.",
);

const loop = new GameLoop({ tick, render });
loop.start();
