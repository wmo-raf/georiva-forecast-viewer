/**
 * A run's steps grouped by UTC day, for the strip along the bottom.
 *
 * One cell per day holding the indices of the steps that fall in it; the
 * playhead sits inside a cell at the step's hour of day, so a 3-hourly and
 * an hourly run read the same way. UTC throughout: forecast times are UTC
 * and the strip must not shift by the viewer's zone.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DayCell {
  /** `YYYY-MM-DD` in UTC. */
  key: string;
  day: number;
  weekday: string;
  /** Indices into the run's valid times, in order. */
  steps: number[];
}

export function dayCells(times: string[]): DayCell[] {
  const cells: DayCell[] = [];
  times.forEach((iso, index) => {
    const date = new Date(iso);
    const key = date.toISOString().slice(0, 10);
    const last = cells[cells.length - 1];
    if (last && last.key === key) {
      last.steps.push(index);
    } else {
      cells.push({ key, day: date.getUTCDate(), weekday: WEEKDAYS[date.getUTCDay()], steps: [index] });
    }
  });
  return cells;
}

export function cellOf(cells: DayCell[], step: number): DayCell | undefined {
  return cells.find((c) => c.steps.includes(step));
}

/**
 * One step named in full: the UTC day and the time of day.
 *
 * The strip's floating label says which step is on screen, and anything else
 * that names one should say it the same way. UTC and the module's own weekday
 * names, not the viewer's locale: a forecast time shifted into local time
 * would not line up with the cells it sits over.
 */
export function stepLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} · ${hours}:${minutes} UTC`;
}

/** Where in its day a step falls, 0 at midnight to just under 1 at the end of the day. */
export function progressWithin(times: string[], step: number): number {
  const date = new Date(times[step]);
  return (date.getUTCHours() * 60 + date.getUTCMinutes()) / (24 * 60);
}

/**
 * The step nearest a point within one cell, the fraction measured across that
 * cell's own width. A click and a drag both land here, so picking a time by
 * either reads the same way.
 */
export function nearestStepInCell(times: string[], cell: DayCell, within: number): number {
  let best = cell.steps[0];
  let distance = Infinity;
  for (const step of cell.steps) {
    const d = Math.abs(progressWithin(times, step) - within);
    if (d < distance) {
      distance = d;
      best = step;
    }
  }
  return best;
}

/**
 * The inverse of the playhead: the step nearest a fraction across the whole
 * strip. The playhead's position is `(cellIndex + progressWithin) / cells`, so
 * the fraction picks the cell first and the hour within it second — the axis is
 * days, not steps, and an hourly run is read the same way as a 3-hourly one.
 * Outside the strip it gives the nearest end, which is what a drag past the
 * edge should hold on to.
 */
export function stepAtFraction(times: string[], cells: DayCell[], fraction: number): number {
  if (cells.length === 0) return 0;
  // Just inside 1, so the far edge belongs to the last cell rather than to a
  // cell past the end of the strip.
  const clamped = Math.min(0.999999, Math.max(0, fraction));
  const place = clamped * cells.length;
  const index = Math.min(cells.length - 1, Math.floor(place));
  return nearestStepInCell(times, cells[index], place - index);
}

/** How far the tooltip's arrow stays clear of its own rounded corners. */
const ARROW_INSET = 12;

export interface TooltipAnchor {
  /** The centre of the tooltip's box, in pixels across the strip. */
  left: number;
  /** The arrow's position within that box, in pixels from its left edge. */
  arrow: number;
}

/**
 * Where to put the tooltip and its arrow for a playhead at `playheadPx`.
 *
 * The box is held inside the strip so it never spills over the map, and the
 * arrow then moves within the box to stay over the playhead itself. The label
 * is a drag handle, so it must not sit over a step it does not hold: at the
 * ends the box stops and the arrow keeps pointing.
 */
export function tooltipAnchor(playheadPx: number, labelWidth: number, stripWidth: number): TooltipAnchor {
  const half = labelWidth / 2;
  if (labelWidth <= 0 || stripWidth <= 0) return { left: playheadPx, arrow: half };
  // A label wider than the strip has nowhere to be held; centre it and let the
  // arrow travel across it.
  const left = labelWidth >= stripWidth ? stripWidth / 2 : Math.min(stripWidth - half, Math.max(half, playheadPx));
  const reach = Math.max(ARROW_INSET, Math.min(labelWidth - ARROW_INSET, half + (playheadPx - left)));
  return { left, arrow: reach };
}
