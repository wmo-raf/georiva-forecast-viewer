/**
 * The runs a user may open and the steps inside each.
 *
 * Two routes, joined on reference time: the runs route knows which runs are
 * complete and which is the latest (ADR 0026), EDR knows every run's valid
 * times. Only complete runs are offered, newest first, and the latest
 * complete one is selected. A run still arriving is never shown: the user
 * sees the previous run whole rather than a timeline that stops short.
 */

import type { EdrCollection, RunsResponse } from "../api/types";

export interface TimelineRun {
  reference_time: string;
  valid_times: string[];
}

export interface Timeline {
  runs: TimelineRun[];
  /** The reference time to open on, or null when no run is complete. */
  selected: string | null;
}

export function buildTimeline(runs: RunsResponse, edr: EdrCollection): Timeline {
  const times = new Map((edr["x-georiva"].runs ?? []).map((r) => [r.reference_time, r.valid_times]));
  const complete = runs.runs
    .filter((r) => r.complete && times.has(r.reference_time))
    .sort((a, b) => (a.reference_time < b.reference_time ? 1 : -1))
    .map((r) => ({ reference_time: r.reference_time, valid_times: times.get(r.reference_time)! }));
  const latest = runs.latest_complete?.reference_time ?? null;
  const selected = complete.some((r) => r.reference_time === latest) ? latest : (complete[0]?.reference_time ?? null);
  return { runs: complete, selected };
}

/** The next step index, wrapping at either end. */
export function stepIndex(current: number, count: number, delta: number): number {
  if (count === 0) return 0;
  return (((current + delta) % count) + count) % count;
}
