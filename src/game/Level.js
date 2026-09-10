/**
 * Level — turns one declarative level-data object into runtime state.
 *
 * The Level owns every piece of DYNAMIC world state (which plates are held,
 * which gates are passable) and knows how to put all of it back to its
 * starting configuration. LoopManager calls reset() on every loop boundary,
 * so a loop always begins from an identical world — which is precisely what
 * makes echo replays reproduce their original runs.
 *
 * Nothing here mutates the source data object: a Level can be constructed
 * repeatedly from the same definition (e.g. restarting a level).
 */
import { rectsOverlap } from "./Physics.js";
import { MovingPlatform } from "./MovingPlatform.js";

export class Level {
  /** @param {object} data one entry from levelData.js */
  constructor(data) {
    if (!data || typeof data !== "object") {
      throw new TypeError("Level requires a level-data object.");
    }
    for (const key of ["id", "loopDurationTicks", "playerStart", "goal"]) {
      if (data[key] == null) {
        throw new TypeError(`Level "${data.id ?? "?"}" is missing "${key}".`);
      }
    }

    this.data = data;
    this.id = data.id;
    this.chapter = data.chapter ?? 1;
    this.loopDurationTicks = data.loopDurationTicks;
    this.maxEchoes = data.maxEchoes ?? 2;
    this.minEchoesForThreeStars = data.minEchoesForThreeStars ?? 1;
    this.playerStart = { x: data.playerStart.x, y: data.playerStart.y };

    /** Static collidable rectangles. @type {Array<{x,y,w,h,type:string}>} */
    this.geometry = (data.geometry ?? []).map((g) => ({
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      type: g.type ?? "solid",
    }));

    /** Pressure plates. `pressed` is recomputed every tick. */
    this.switches = (data.switches ?? []).map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      activatesDoorId: s.activatesDoorId ?? null,
      // Default true: only an explicit false locks echoes out of a plate.
      echoesCanActivate: s.echoesCanActivate !== false,
      pressed: false,
      // Rising edge of `pressed`, recomputed each tick. Presentation only
      // (the switch chime); nothing in the simulation reads it.
      justPressed: false,
    }));

    /** Gates. `open` is derived from wired switches every tick. */
    this.doors = (data.doors ?? []).map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      startsOpen: d.startsOpen === true,
      open: d.startsOpen === true,
    }));

    /**
     * Moving platforms: solid like geometry, but they also carry whatever is
     * standing on them. Their positions are pure functions of the loop tick.
     * @type {MovingPlatform[]}
     */
    this.movingPlatforms = (data.movingPlatforms ?? []).map(
      (p, i) => new MovingPlatform(p, i),
    );
    /** @type {Map<string, MovingPlatform>} */
    this.platformsById = new Map(this.movingPlatforms.map((p) => [p.id, p]));

    this.goal = { x: data.goal.x, y: data.goal.y, w: data.goal.w, h: data.goal.h };

    // doorId -> switches wired to it (a door needs ALL of them pressed).
    /** @type {Map<string, Array<object>>} */
    this.switchesByDoor = new Map();
    for (const sw of this.switches) {
      if (!sw.activatesDoorId) continue;
      const door = this.doors.find((d) => d.id === sw.activatesDoorId);
      if (!door) {
        throw new Error(
          `Level "${this.id}": switch "${sw.id}" targets unknown door "${sw.activatesDoorId}".`,
        );
      }
      const list = this.switchesByDoor.get(sw.activatesDoorId);
      if (list) list.push(sw);
      else this.switchesByDoor.set(sw.activatesDoorId, [sw]);
    }

    // Reused each tick so the hot loop allocates nothing.
    /** @type {Array<{x:number,y:number,w:number,h:number}>} */
    this._solids = [];
  }

  /**
   * Everything solid this tick: static geometry, every currently-closed door,
   * and every moving platform. Platforms are ordinary solids for landing and
   * jumping — the only extra behaviour is carrying riders (see carryRiders).
   */
  getSolids() {
    const solids = this._solids;
    solids.length = 0;
    for (const g of this.geometry) {
      if (g.type === "solid") solids.push(g);
    }
    for (const door of this.doors) {
      if (!door.open) solids.push(door);
    }
    for (const platform of this.movingPlatforms) {
      solids.push(platform);
    }
    return solids;
  }

  /**
   * Advance every moving platform to a tick. Must run before entities move.
   * @param {number} tick tick index within the current loop
   */
  updatePlatforms(tick) {
    for (const platform of this.movingPlatforms) platform.updateTo(tick);
  }

  /**
   * Carry riders along with the platform they were standing on.
   *
   * Riding is established during collision resolution: an entity that
   * resolved a "top" contact against a platform last tick has that platform's
   * id in `ridingId`. Here — before this tick's physics — the rider is
   * displaced by the platform's delta, which keeps their position relative to
   * the deck exactly fixed. Normal physics and collision then run as usual,
   * so a rider can still walk, jump off, or be pushed into a wall.
   *
   * @param {Array<{x:number,y:number,ridingId?:string|null}>} entities
   */
  carryRiders(entities) {
    if (this.movingPlatforms.length === 0) return;
    for (const entity of entities) {
      if (!entity.ridingId) continue;
      const platform = this.platformsById.get(entity.ridingId);
      if (!platform) continue;
      entity.x += platform.dx;
      entity.y += platform.dy;
    }
  }

  /**
   * Recompute plate and gate state from the entities' current positions.
   * Call once per tick, after everything has moved.
   *
   * @param {Array<{x:number,y:number,w:number,h:number,isEcho?:boolean}>} entities
   *   The live player plus every echo.
   */
  updateSwitches(entities) {
    for (const sw of this.switches) {
      let pressed = false;
      for (const entity of entities) {
        if (entity.isEcho && !sw.echoesCanActivate) continue;
        if (rectsOverlap(entity, sw)) {
          pressed = true;
          break;
        }
      }
      sw.justPressed = pressed && !sw.pressed;
      sw.pressed = pressed;
    }

    for (const door of this.doors) {
      const wired = this.switchesByDoor.get(door.id);
      if (!wired || wired.length === 0) {
        door.open = door.startsOpen;
        continue;
      }
      // AND across every wired plate; startsOpen inverts the result, so a
      // door that starts open is a hold-to-CLOSE gate.
      const allPressed = wired.every((sw) => sw.pressed);
      door.open = door.startsOpen !== allPressed;
    }
  }

  /** @param {{x:number,y:number,w:number,h:number}} entity */
  isGoalReached(entity) {
    return rectsOverlap(entity, this.goal);
  }

  /** @param {string} id */
  getDoor(id) {
    return this.doors.find((d) => d.id === id) ?? null;
  }

  /**
   * Return all dynamic state to the level's initial configuration.
   * Called by LoopManager on every loop reset (and on level restart).
   */
  reset() {
    for (const sw of this.switches) {
      sw.pressed = false;
      sw.justPressed = false;
    }
    for (const door of this.doors) door.open = door.startsOpen;
    // Platforms rewind to their tick-0 position, so every loop replays the
    // exact same motion and echoes meet them where they expect.
    for (const platform of this.movingPlatforms) platform.reset();
  }
}

export default Level;
