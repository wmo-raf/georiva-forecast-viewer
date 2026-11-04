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

/** Where in its day a step falls, 0 at midnight to just under 1 at the end of the day. */
export function progressWithin(_cell: DayCell, times: string[], step: number): number {
  const date = new Date(times[step]);
  return (date.getUTCHours() * 60 + date.getUTCMinutes()) / (24 * 60);
}
