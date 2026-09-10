/**
 * levelData.js — declarative, JSON-serializable level definitions.
 *
 * Everything here is plain data (no functions, no class instances, no
 * references), so this array could be dropped into a .json file or fetched
 * from disk later without changing the loader. src/game/Level.js turns one
 * of these objects into runtime state.
 *
 * SCHEMA
 * ------
 * {
 *   id: "1-1",                        // unique level id
 *   chapter: 1,
 *   loopDurationTicks: 900,           // 900 ticks = 15s at the fixed 60Hz step
 *   maxEchoes: 2,                     // echo budget; further recordings drop
 *   minEchoesForThreeStars: 1,        // scoring target (used in a later phase)
 *   playerStart: { x, y },            // top-left spawn of the 22x30 player
 *   geometry: [ { x, y, w, h, type: "solid" } ],
 *   switches: [ {
 *     id, x, y, w, h,
 *     activatesDoorId,                // which door this plate is wired to
 *     echoesCanActivate: true,        // false => only the live player counts
 *   } ],
 *   doors: [ { id, x, y, w, h, startsOpen: false } ],
 *   movingPlatforms: [ {
 *     id, x, y, w, h,                 // x/y = the path anchor (offset 0)
 *     pathType: "horizontal"|"vertical",
 *     range,                          // path length in px; negative flips it
 *     speed,                          // PIXELS PER TICK (not per second)
 *     startOffset,                    // phase offset in px along the path
 *   } ],
 *   goal: { x, y, w, h },
 * }
 *
 * MOVING PLATFORMS
 * - Motion is a triangle wave: anchor -> anchor+range -> anchor -> ...
 *   "horizontal" adds the offset to x (positive = right); "vertical"
 *   SUBTRACTS it from y (positive range = rises upward).
 * - Position is a pure function of the loop tick, so a platform is in the
 *   same place at tick N of every loop and echoes can ride it reliably.
 * - They are solid like geometry and additionally carry whatever stands on
 *   them.
 *
 * PLATFORM LEVEL-DESIGN RULES OF THUMB (learned while authoring Chapter 2)
 * - A lift's anchor sits at y=500, i.e. inside the floor slab, so it rises
 *   up through the floor and scoops up anything standing over it. That makes
 *   boarding forgiving: walk to the wall and wait.
 * - A lift's apex is ~20px ABOVE the ledge it serves. If the apex were level
 *   with the ledge, the rider could only step off on the single tick the
 *   platform was exactly aligned; the overshoot turns that into a ~30-tick
 *   window (and the rider just drops the last few pixels).
 * - Pair every lift with a wall on the side the rider should exit toward:
 *   holding that direction presses them against the wall for the whole ride,
 *   then walks them out the moment the platform clears the top.
 *
 * SEMANTICS (implemented in Level.js)
 * - A switch is pressed while ANY eligible entity's AABB overlaps it.
 * - A door wired to several switches needs ALL of them pressed (AND). This is
 *   what forces multi-echo cooperation.
 * - A door is passable when `startsOpen !== allWiredSwitchesPressed`, so
 *   `startsOpen: true` yields a hold-to-close gate. Closed doors are solid;
 *   open doors are removed from the collision set entirely.
 *
 * DESIGN NOTES
 * - Doors are 240px tall on a 500px floor: a jump peaks at ~128px, so a gate
 *   can never be hopped over. Switches are the only way through.
 * - Because the last actor in a loop must be free to walk, a level can never
 *   require more simultaneous held switches than its echo budget.
 */

/** @typedef {{x:number,y:number,w:number,h:number,type?:string}} GeometryRect */

const FLOOR = { x: 0, y: 500, w: 960, h: 40, type: "solid" };

export const LEVELS = [
  {
    // 1-1 — TEACH: your past self can hold a switch for you.
    // Solution (1 echo): loop 1, walk onto the plate and stand still. Loop 2,
    // the echo holds it open while you walk through the gate to the goal.
    id: "1-1",
    chapter: 1,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 1,
    playerStart: { x: 60, y: 440 },
    geometry: [FLOOR],
    switches: [
      {
        id: "sw1",
        x: 240,
        y: 484,
        w: 140,
        h: 16,
        activatesDoorId: "door1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "door1", x: 660, y: 260, w: 26, h: 240, startsOpen: false }],
    goal: { x: 850, y: 440, w: 40, h: 60 },
  },

  {
    // 1-2 — TEACH: two plates, one gate. Echoes must cooperate (AND logic).
    // Solution (2 echoes): loop 1 hold plate A, loop 2 hold plate B, loop 3
    // both echoes hold their plates and you stroll through.
    id: "1-2",
    chapter: 1,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 2,
    playerStart: { x: 60, y: 440 },
    geometry: [FLOOR],
    switches: [
      {
        id: "sw_a",
        x: 170,
        y: 484,
        w: 110,
        h: 16,
        activatesDoorId: "door1",
        echoesCanActivate: true,
      },
      {
        id: "sw_b",
        x: 360,
        y: 484,
        w: 110,
        h: 16,
        activatesDoorId: "door1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "door1", x: 700, y: 260, w: 26, h: 240, startsOpen: false }],
    goal: { x: 870, y: 440, w: 40, h: 60 },
  },

  {
    // 1-3 — TEACH: dependency chains. An echo opens the way for the NEXT echo.
    // Plate A opens gate D; plate B (behind D) opens gate E.
    // Solution (2 echoes): loop 1 hold A. Loop 2, echo #1 holds A so D is open
    // for YOU — run through it and hold B. Loop 3, echo #1 holds A and echo #2
    // repeats that run to hold B, so both gates stand open for the goal run.
    id: "1-3",
    chapter: 1,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 2,
    playerStart: { x: 50, y: 440 },
    geometry: [FLOOR],
    switches: [
      {
        id: "sw_a",
        x: 140,
        y: 484,
        w: 110,
        h: 16,
        activatesDoorId: "doorD",
        echoesCanActivate: true,
      },
      {
        id: "sw_b",
        x: 540,
        y: 484,
        w: 110,
        h: 16,
        activatesDoorId: "doorE",
        echoesCanActivate: true,
      },
    ],
    doors: [
      { id: "doorD", x: 400, y: 260, w: 26, h: 240, startsOpen: false },
      { id: "doorE", x: 740, y: 260, w: 26, h: 240, startsOpen: false },
    ],
    goal: { x: 870, y: 440, w: 40, h: 60 },
  },

  {
    // 1-4 — TEACH: echoes work in three dimensions of space, not just time.
    // The gate needs a ground plate AND a plate on a raised ledge, so one echo
    // has to be parked up top.
    // Solution (2 echoes): loop 1 run right and jump onto the ledge, landing on
    // the high plate. Loop 2 hold the ground plate. Loop 3 walk under the ledge
    // and through the gate.
    id: "1-4",
    chapter: 1,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 2,
    playerStart: { x: 50, y: 440 },
    // Ledge sits 100px above the floor: comfortably inside the ~128px jump
    // apex, and wide enough that the landing is not frame-perfect.
    geometry: [FLOOR, { x: 330, y: 400, w: 180, h: 20, type: "solid" }],
    switches: [
      {
        id: "sw_ground",
        x: 110,
        y: 484,
        w: 130,
        h: 16,
        activatesDoorId: "door1",
        echoesCanActivate: true,
      },
      {
        id: "sw_high",
        x: 350,
        y: 384,
        w: 140,
        h: 16,
        activatesDoorId: "door1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "door1", x: 640, y: 260, w: 26, h: 240, startsOpen: false }],
    goal: { x: 870, y: 440, w: 40, h: 60 },
  },

  {
    // 1-5 — CLIMAX: chain + verticality on a longer map.
    // Plate A opens gate D. Behind D, a ledge plate opens the final gate F.
    // Solution (2 echoes): loop 1 hold A. Loop 2, with D held open by echo #1,
    // sprint through it and jump onto the ledge plate. Loop 3, echo #1 holds A
    // and echo #2 holds the ledge, so both gates are open end to end.
    id: "1-5",
    chapter: 1,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 2,
    playerStart: { x: 40, y: 440 },
    geometry: [
      FLOOR,
      { x: 500, y: 400, w: 200, h: 20, type: "solid" },
      // Decorative overhead beam: well above head height, never in the way.
      { x: 240, y: 200, w: 120, h: 16, type: "solid" },
    ],
    switches: [
      {
        id: "sw_a",
        x: 120,
        y: 484,
        w: 130,
        h: 16,
        activatesDoorId: "doorD",
        echoesCanActivate: true,
      },
      {
        id: "sw_ledge",
        x: 520,
        y: 384,
        w: 160,
        h: 16,
        activatesDoorId: "doorF",
        echoesCanActivate: true,
      },
    ],
    doors: [
      { id: "doorD", x: 380, y: 260, w: 26, h: 240, startsOpen: false },
      { id: "doorF", x: 790, y: 260, w: 26, h: 240, startsOpen: false },
    ],
    goal: { x: 890, y: 440, w: 40, h: 60 },
  },

  // =========================================================================
  // CHAPTER 2 — moving platforms
  // =========================================================================

  {
    // 2-1 — TEACH: lifts. Walk into the wall above a lift and it scoops you up.
    // Solution (1 echo): loop 1, stand on the floor plate. Loop 2, the echo
    // holds the gate open — walk right, ride the lift, step onto the terrace.
    id: "2-1",
    chapter: 2,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 1,
    playerStart: { x: 60, y: 440 },
    geometry: [
      FLOOR,
      // Terrace + its supporting wall in one block: the wall is what the
      // rider presses against on the way up.
      { x: 770, y: 300, w: 190, h: 240, type: "solid" },
    ],
    switches: [
      {
        id: "sw1",
        x: 120,
        y: 484,
        w: 140,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "gate1", x: 520, y: 260, w: 26, h: 240, startsOpen: false }],
    movingPlatforms: [
      {
        id: "lift1",
        x: 660,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 220, // apex y=280, 20px above the terrace at 300
        speed: 1.4,
        startOffset: 0,
      },
    ],
    goal: { x: 850, y: 240, w: 40, h: 60 },
  },

  {
    // 2-2 — TEACH: one echo per direction. Two lifts serve two towers.
    // Solution (1 echo): loop 1, hold LEFT — ride the west lift and park on
    // the high plate. Loop 2, hold RIGHT — the gate is open, ride the east
    // lift to the goal while your echo keeps the plate down.
    id: "2-2",
    chapter: 2,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 1,
    playerStart: { x: 470, y: 440 },
    geometry: [
      FLOOR,
      { x: 0, y: 300, w: 200, h: 240, type: "solid" }, // west tower
      { x: 800, y: 320, w: 160, h: 220, type: "solid" }, // east tower
    ],
    switches: [
      {
        id: "sw_high",
        x: 0,
        y: 284,
        w: 170,
        h: 16,
        activatesDoorId: "gateE",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "gateE", x: 560, y: 280, w: 26, h: 220, startsOpen: false }],
    movingPlatforms: [
      {
        id: "liftW",
        x: 200,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 220, // apex 280, tower top 300
        speed: 1.3,
        startOffset: 0,
      },
      {
        id: "liftE",
        x: 690,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 200, // apex 300, tower top 320
        speed: 1.7,
        startOffset: 60,
      },
    ],
    goal: { x: 860, y: 260, w: 40, h: 60 },
  },

  {
    // 2-3 — TEACH: horizontal ferries, and that standing still is a move.
    // Solution (1 echo): loop 1, just hold RIGHT — you end up on the floor
    // plate at the foot of the east deck. Loop 2, board the ferry from the
    // west deck and STAND STILL while it carries you across, then walk off
    // east through the gate your echo is holding open.
    id: "2-3",
    chapter: 2,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 1,
    playerStart: { x: 190, y: 310 },
    geometry: [
      FLOOR,
      { x: 0, y: 340, w: 220, h: 200, type: "solid" }, // west deck
      { x: 600, y: 340, w: 360, h: 200, type: "solid" }, // east deck
    ],
    switches: [
      {
        // Sits where a plain "hold right" run comes to rest, against the
        // foot of the east deck — so banking the first echo is effortless
        // and the puzzle is about the ferry, not about parking.
        id: "sw1",
        x: 455,
        y: 484,
        w: 145,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "gate1", x: 700, y: 100, w: 26, h: 240, startsOpen: false }],
    movingPlatforms: [
      {
        id: "ferry",
        x: 220,
        y: 340,
        w: 120,
        h: 20,
        pathType: "horizontal",
        // Travels 220 -> 480; flush with the west deck at one end and the
        // east deck (right edge 600) at the other.
        range: 260,
        speed: 1.6,
        startOffset: 0,
      },
    ],
    goal: { x: 880, y: 280, w: 40, h: 60 },
  },

  {
    // 2-4 — ESCALATE: two plates, two lifts, one gate (AND).
    // Solution (1 echo): loop 1, hold LEFT and park the echo on the west
    // plate. Loop 2, hold RIGHT — ride the east lift and walk into the east
    // plate; with both plates down the gate opens and you walk on to the goal.
    id: "2-4",
    chapter: 2,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 1,
    playerStart: { x: 340, y: 440 },
    geometry: [
      FLOOR,
      { x: 0, y: 330, w: 190, h: 210, type: "solid" },
      { x: 770, y: 330, w: 190, h: 210, type: "solid" },
    ],
    switches: [
      {
        id: "sw_west",
        x: 0,
        y: 314,
        w: 160,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
      {
        id: "sw_east",
        x: 790,
        y: 314,
        w: 120,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "gate1", x: 900, y: 90, w: 26, h: 240, startsOpen: false }],
    movingPlatforms: [
      {
        id: "liftW",
        x: 190,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 190, // apex 310, tower top 330
        speed: 1.15,
        startOffset: 0,
      },
      {
        id: "liftE",
        x: 660,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 190,
        speed: 1.75, // deliberately out of step with the west lift
        startOffset: 95,
      },
    ],
    goal: { x: 928, y: 270, w: 32, h: 60 },
  },

  {
    // 2-5 — CLIMAX: three lifts, two plates, and a summit in the middle.
    // Solution (2 echoes): loop 1 hold LEFT (west plate), loop 2 hold RIGHT
    // (east plate), loop 3 stand still on the centre lift and ride it to the
    // summit — both echoes hold the gate open while you walk to the goal.
    id: "2-5",
    chapter: 2,
    loopDurationTicks: 900,
    maxEchoes: 2,
    minEchoesForThreeStars: 2,
    playerStart: { x: 440, y: 440 },
    geometry: [
      FLOOR,
      { x: 0, y: 330, w: 190, h: 210, type: "solid" }, // west tower
      { x: 770, y: 330, w: 190, h: 210, type: "solid" }, // east tower
      // Summit ledge: thin, so the floor route below stays open.
      { x: 510, y: 270, w: 200, h: 20, type: "solid" },
    ],
    switches: [
      {
        id: "sw_west",
        x: 0,
        y: 314,
        w: 160,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
      {
        id: "sw_east",
        x: 800,
        y: 314,
        w: 160,
        h: 16,
        activatesDoorId: "gate1",
        echoesCanActivate: true,
      },
    ],
    doors: [{ id: "gate1", x: 600, y: 30, w: 26, h: 240, startsOpen: false }],
    movingPlatforms: [
      {
        id: "liftW",
        x: 190,
        y: 500,
        w: 100,
        h: 20,
        pathType: "vertical",
        range: 190,
        speed: 1.2,
        startOffset: 0,
      },
      {
        id: "liftE",
        x: 670,
        y: 500,
        w: 100,
        h: 20,
        pathType: "vertical",
        range: 190,
        speed: 1.8,
        startOffset: 120,
      },
      {
        id: "liftC",
        x: 400,
        y: 500,
        w: 110,
        h: 20,
        pathType: "vertical",
        range: 250, // apex 250, summit ledge at 270
        speed: 1.35,
        startOffset: 0,
      },
    ],
    goal: { x: 650, y: 210, w: 40, h: 60 },
  },
];

/** @param {string} id */
export function getLevelDataById(id) {
  return LEVELS.find((level) => level.id === id) ?? null;
}

/** @param {number} index */
export function getLevelDataByIndex(index) {
  return LEVELS[index] ?? null;
}

export const LEVEL_IDS = LEVELS.map((level) => level.id);
