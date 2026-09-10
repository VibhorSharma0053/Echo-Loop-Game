/**
 * MovingPlatform — a solid rectangle that oscillates along one axis.
 *
 * DETERMINISM (the whole reason this class exists in this shape):
 * a platform's position is a PURE FUNCTION of the loop tick —
 * `positionAt(tick)` — never of accumulated real time and never of its own
 * previous state. Echoes replay a recorded input stream against the loop's
 * tick counter, so a platform must be in exactly the same place at tick N of
 * every loop. If position were integrated from elapsed time (or accumulated
 * per-frame), tiny float drift or a single dropped frame would move the
 * platform a few pixels, and an echo that jumped for it in its original run
 * would miss it on replay — silently breaking every puzzle built on riding.
 *
 * Motion is a triangle wave: the platform travels from its start position to
 * start + range, back to start, and repeats forever.
 *
 *   pathType "horizontal" -> x = startX + offset   (positive range = right)
 *   pathType "vertical"   -> y = startY - offset   (positive range = UP)
 *
 * A negative `range` flips the direction. `speed` is pixels per tick and
 * `startOffset` is a phase offset measured in pixels along the path, so two
 * platforms can share a period but sit at different points in their cycle.
 */

export class MovingPlatform {
  /**
   * @param {object} data level-data entry
   * @param {number} [index] fallback for a missing id
   */
  constructor(data, index = 0) {
    this.id = data.id ?? `mp${index}`;
    /** Path anchor — the platform's position at offset 0. */
    this.startX = data.x;
    this.startY = data.y;
    this.w = data.w;
    this.h = data.h;
    this.pathType = data.pathType === "vertical" ? "vertical" : "horizontal";
    this.range = Number(data.range) || 0;
    this.speed = Math.abs(Number(data.speed) || 0);
    this.startOffset = Number(data.startOffset) || 0;

    /** Marks this rect as a rider-carrying solid during collision. */
    this.isMovingPlatform = true;

    /** Current position + this tick's delta (what riders are carried by). */
    this.x = this.startX;
    this.y = this.startY;
    this.dx = 0;
    this.dy = 0;

    this.reset();
  }

  /** Distance along the path at a tick: a triangle wave in [0, |range|]. */
  offsetAt(tick) {
    const span = Math.abs(this.range);
    if (span === 0 || this.speed === 0) return 0;
    const direction = this.range < 0 ? -1 : 1;
    const period = span * 2;
    const raw = this.startOffset + tick * this.speed;
    // Positive modulo so negative ticks/offsets still behave.
    const phase = ((raw % period) + period) % period;
    const triangle = phase <= span ? phase : period - phase;
    return triangle * direction;
  }

  /**
   * Where this platform is at a given tick. Pure — same tick, same answer,
   * on every loop and every machine.
   * @param {number} tick
   */
  positionAt(tick) {
    const offset = this.offsetAt(tick);
    return this.pathType === "vertical"
      ? { x: this.startX, y: this.startY - offset }
      : { x: this.startX + offset, y: this.startY };
  }

  /**
   * Move to the given tick, recording the delta riders must be carried by.
   * Called once per tick, in order, before entities move.
   * @param {number} tick
   */
  updateTo(tick) {
    const { x, y } = this.positionAt(tick);
    this.dx = x - this.x;
    this.dy = y - this.y;
    this.x = x;
    this.y = y;
  }

  /** Snap back to the tick-0 position with no carry delta. */
  reset() {
    const { x, y } = this.positionAt(0);
    this.x = x;
    this.y = y;
    this.dx = 0;
    this.dy = 0;
  }
}

export default MovingPlatform;
