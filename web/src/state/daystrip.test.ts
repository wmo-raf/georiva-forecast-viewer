import { describe, expect, it } from "vitest";
import { cellOf, dayCells, progressWithin } from "./daystrip";

const times = [
  "2026-11-03T12:00:00+00:00",
  "2026-11-03T15:00:00+00:00",
  "2026-11-03T18:00:00+00:00",
  "2026-11-03T21:00:00+00:00",
  "2026-11-04T00:00:00+00:00",
  "2026-11-04T03:00:00+00:00",
  "2026-11-05T00:00:00+00:00",
];

describe("the day strip groups a run's steps by UTC day", () => {
  it("makes one cell per day with the step indices it holds", () => {
    const cells = dayCells(times);
    expect(cells.map((c) => c.steps)).toEqual([[0, 1, 2, 3], [4, 5], [6]]);
  });

  it("labels each cell with the day of month and the weekday", () => {
    const [first] = dayCells(times);
    expect(first.day).toBe(3);
    expect(first.weekday).toBe("Tue");
    expect(first.key).toBe("2026-11-03");
  });

  it("finds the cell a step belongs to", () => {
    const cells = dayCells(times);
    expect(cellOf(cells, 5)).toBe(cells[1]);
    expect(cellOf(cells, 99)).toBeUndefined();
  });

  it("places the playhead within a cell by the step's hour of day", () => {
    const cells = dayCells(times);
    expect(progressWithin(cells[0], times, 0)).toBeCloseTo(0.5);
    expect(progressWithin(cells[0], times, 3)).toBeCloseTo(0.875);
    expect(progressWithin(cells[1], times, 4)).toBe(0);
  });

  it("has no cells for an empty run", () => {
    expect(dayCells([])).toEqual([]);
  });
});
