/**
 * Framing a model when the user switches to it: whether the map should move,
 * and to what.
 *
 * One rule, no exceptions: the map moves only when the data is not already on
 * screen — when the view is not wholly inside the new model's bounds. A global
 * model's bounds contain every view, so switching to IFS never moves the map;
 * switching to a Kenya WRF from an Africa-wide view frames Kenya.
 *
 * A switch is a *request*; it is answered once, when the new model's bounds
 * arrive (its EDR description, or the Weather layer's town forecasts), and it
 * is withdrawn if the user moves the map in the meantime — they have already
 * chosen where to look. `MapView.vue` performs the move; this decides it.
 */

/** West, south, east, north, in degrees. */
export type Extent = [number, number, number, number];

/** Whether `view` lies wholly inside `bounds`. */
export function inside(view: Extent, bounds: Extent): boolean {
  const [w, s, e, n] = view;
  const [bw, bs, be, bn] = bounds;
  return w >= bw && s >= bs && e <= be && n <= bn;
}

/**
 * A bounding box as the routes spell it: EDR's nested list of boxes (its first
 * box), or one flat box (Forti's `bbox`). Anything else is no box at all.
 */
export function extentOf(raw: unknown): Extent | null {
  const box = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  return box as Extent;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The room the chrome over the map leaves, in CSS pixels, so a framed area is
 * not fitted under the bottom bar or the rail. On a narrow screen the corner
 * column stacks above the day strip (`style.css`), so the bottom is taller and
 * the sides need only a gutter; the rail there is an overlay a user closes.
 */
export function fitPadding({ narrow, railOpen }: { narrow: boolean; railOpen: boolean }): Padding {
  if (narrow) return { top: 60, right: 16, bottom: 230, left: 16 };
  return { top: 40, right: 40, bottom: 140, left: railOpen ? 230 : 40 };
}

/** The closest a framing zooms in: a city-scale domain should not land at street level. */
export const FIT_MAX_ZOOM = 8;

/** Seconds a framing flies for; reduced motion jumps instead. */
export const FIT_DURATION_MS = 800;

/** One switch's request to be framed, answered once. */
export class Framer {
  private pending = false;

  /** A switch happened: frame the new model when its bounds arrive. */
  request(): void {
    this.pending = true;
  }

  /** The user panned or zoomed: they have chosen where to look. */
  userMoved(): void {
    this.pending = false;
  }

  /**
   * The new model's bounds are here. The extent to fit, or null — nothing was
   * asked, the user moved since, or the data is already on screen. Either way
   * the request is answered.
   */
  arrived(view: Extent, bounds: Extent): Extent | null {
    if (!this.pending) return null;
    this.pending = false;
    return inside(view, bounds) ? null : bounds;
  }
}
