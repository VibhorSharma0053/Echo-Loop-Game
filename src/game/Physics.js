/**
 * Physics — minimal AABB collision resolution for a tile-platformer.
 *
 * This is deliberately NOT a general physics engine. There is one moving
 * entity-collides-with-static-rectangle operation, resolved positionally.
 *
 * Entry-side inference: the resolver looks at where the entity was at the
 * START of the tick (prevX/prevY — recorded by the entity before it moved)
 * to decide which face of the rectangle was hit. That keeps resolution
 * correct even when a fast fall penetrates deeply: the approach direction
 * decides the axis, not the penetration depth. A smallest-overlap fallback
 * covers diagonal corner entries and degenerate "spawned inside" states.
 *
 * Contract for `entity`: { x, y, w, h, vx, vy, prevX, prevY }, top-left
 * origin, y-axis pointing down. The resolver mutates position and zeroes
 * the velocity component of the face that was hit (a simple positional
 * stop — the entity is free to "slide along" the wall on the next tick).
 */

/**
 * Do two axis-aligned rectangles strictly overlap?
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 */
export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Resolve an entity against a MOVING PLATFORM: solid from above only.
 *
 * WHY ONE-WAY (this was a real bug, not a shortcut):
 * resolveAABBCollision assumes the rectangle is static, so it infers which
 * face was hit from where the ENTITY came from. A platform that descends
 * onto a stationary entity breaks that assumption — the entity didn't move,
 * the world did. The resolver then pushed the entity downward into the floor
 * and, once the overlap grew, ejected it sideways; in testing a lift cycling
 * past a waiting player shoved them out of the level entirely.
 *
 * Treating platforms as one-way (the standard "jump-through" platform) fixes
 * the whole class of problem: a descending deck simply passes over an entity
 * that is already below its surface, so nothing can ever be crushed. Entities
 * still land on top, stand, ride, and jump off exactly like static geometry,
 * and they can now also jump up through a deck from underneath.
 *
 * @param {{x,y,w,h,vy,prevY}} entity
 * @param {{x,y,w,h}} platform
 * @param {number} [tolerance] how far below a deck's surface an entity may
 *   have started the tick and still be caught by it. Must exceed the fastest
 *   platform's per-tick travel so a rising lift reliably scoops up whatever
 *   is standing over it; doubles as a forgiving step-up.
 * @returns {"top"|null}
 */
export function resolveOneWayTop(entity, platform, tolerance = 8) {
  if (!rectsOverlap(entity, platform)) return null;
  // Rising through a deck from below: pass straight through.
  if (entity.vy < 0) return null;
  // Started the tick clearly below the surface: the deck came down onto us,
  // so pass through rather than crush.
  if (entity.prevY + entity.h > platform.y + tolerance) return null;

  entity.y = platform.y - entity.h;
  entity.vy = 0;
  return "top";
}

/**
 * Resolve the overlap between a moving entity and a solid static rectangle.
 *
 * @param {{x:number,y:number,w:number,h:number,vx:number,vy:number,prevX:number,prevY:number}} entity
 * @param {{x:number,y:number,w:number,h:number}} staticRect
 * @returns {"top"|"bottom"|"left"|"right"|null}
 *   The face of `staticRect` the entity came to rest against — "top" means
 *   the entity landed ON TOP of it (the caller treats this as "grounded") —
 *   or null when there was no overlap to resolve.
 */
export function resolveAABBCollision(entity, staticRect) {
  if (!rectsOverlap(entity, staticRect)) return null;

  const prevRight = entity.prevX + entity.w;
  const prevBottom = entity.prevY + entity.h;

  const fromTop = prevBottom <= staticRect.y && entity.vy > 0;
  const fromBottom = entity.prevY >= staticRect.y + staticRect.h && entity.vy < 0;
  const fromLeft = prevRight <= staticRect.x && entity.vx > 0;
  const fromRight = entity.prevX >= staticRect.x + staticRect.w && entity.vx < 0;

  // An unambiguous entry side wins outright. Diagonal corner entries (two
  // sides true at once) and penetration with no clear history fall through
  // to the smallest-overlap fallback below.
  const vertical = fromTop || fromBottom;
  const horizontal = fromLeft || fromRight;

  if (vertical && !horizontal) {
    if (fromTop) {
      // Landed on the rectangle's top face.
      entity.y = staticRect.y - entity.h;
      entity.vy = 0;
      return "top";
    }
    // Bonked the rectangle's underside.
    entity.y = staticRect.y + staticRect.h;
    entity.vy = 0;
    return "bottom";
  }

  if (horizontal && !vertical) {
    if (fromLeft) {
      entity.x = staticRect.x - entity.w;
      entity.vx = 0;
      return "left";
    }
    entity.x = staticRect.x + staticRect.w;
    entity.vx = 0;
    return "right";
  }

  // Fallback: push out along the axis of least penetration.
  const overlapX =
    Math.min(entity.x + entity.w, staticRect.x + staticRect.w) -
    Math.max(entity.x, staticRect.x);
  const overlapY =
    Math.min(entity.y + entity.h, staticRect.y + staticRect.h) -
    Math.max(entity.y, staticRect.y);

  if (overlapX < overlapY) {
    if (entity.x + entity.w / 2 < staticRect.x + staticRect.w / 2) {
      entity.x = staticRect.x - entity.w;
      entity.vx = 0;
      return "left";
    }
    entity.x = staticRect.x + staticRect.w;
    entity.vx = 0;
    return "right";
  }

  if (entity.y + entity.h / 2 < staticRect.y + staticRect.h / 2) {
    entity.y = staticRect.y - entity.h;
    entity.vy = 0;
    return "top";
  }
  entity.y = staticRect.y + staticRect.h;
  entity.vy = 0;
  return "bottom";
}
