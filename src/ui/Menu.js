/**
 * Menu — pure focus/hit-test/navigation logic for canvas-drawn UI.
 *
 * Holds no drawing code and no DOM references, so it is trivially testable:
 * it is just a list of rectangular items plus "which one is focused".
 *
 * Directional navigation is geometric rather than index-based, so the same
 * class drives both a 3-column level grid and a row of buttons: moving right
 * picks the nearest item whose center actually lies to the right, scored by
 * primary-axis distance plus a penalty for drifting off-axis.
 */

export class Menu {
  /** @param {Array<object>} [items] each needs { id, x, y, w, h } */
  constructor(items = []) {
    this.setItems(items);
  }

  /** @param {Array<object>} items */
  setItems(items) {
    /** @type {Array<any>} */
    this.items = items;
    this.focusIndex = items.length > 0 ? 0 : -1;
    /** Index under the pointer, or -1. */
    this.hoverIndex = -1;
  }

  get focused() {
    return this.items[this.focusIndex] ?? null;
  }

  /** @param {number} index */
  setFocus(index) {
    if (index >= 0 && index < this.items.length) this.focusIndex = index;
  }

  /** @param {string} id */
  focusById(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.focusIndex = index;
  }

  static _center(item) {
    return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  }

  /**
   * Move focus in a direction.
   * @param {"left"|"right"|"up"|"down"} direction
   * @returns {boolean} whether focus changed
   */
  move(direction) {
    if (this.items.length === 0) return false;
    if (this.focusIndex < 0) {
      this.focusIndex = 0;
      return true;
    }

    const from = Menu._center(this.items[this.focusIndex]);
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "right" || direction === "down" ? 1 : -1;

    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.items.length; i += 1) {
      if (i === this.focusIndex) continue;
      const to = Menu._center(this.items[i]);
      const primary = (horizontal ? to.x - from.x : to.y - from.y) * sign;
      const offAxis = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
      if (primary <= 1) continue; // not actually in that direction
      // Prefer close on-axis items; off-axis drift is penalised but allowed
      // so navigation can still wrap between grid rows.
      const score = primary + offAxis * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }

    if (best === -1) return false;
    this.focusIndex = best;
    return true;
  }

  /** Cycle focus forward/backward (Tab, or left/right fallback). */
  cycle(step = 1) {
    if (this.items.length === 0) return;
    const n = this.items.length;
    this.focusIndex = ((this.focusIndex + step) % n + n) % n;
  }

  /**
   * Index of the item containing a point, or -1.
   * @param {number} x
   * @param {number} y
   */
  hitTest(x, y) {
    for (let i = 0; i < this.items.length; i += 1) {
      const it = this.items[i];
      if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Update hover state from a pointer position. Hovering also moves focus, so
   * mouse and keyboard never disagree about the highlighted item.
   */
  pointerMove(x, y) {
    const index = this.hitTest(x, y);
    this.hoverIndex = index;
    if (index >= 0) this.focusIndex = index;
    return index;
  }

  /**
   * Activate whatever is under the pointer.
   * @returns {any|null} the activated item
   */
  pointerActivate(x, y) {
    const index = this.hitTest(x, y);
    if (index < 0) return null;
    this.focusIndex = index;
    return this.items[index];
  }

  /** Activate the focused item. @returns {any|null} */
  activate() {
    return this.focused;
  }
}

export default Menu;
