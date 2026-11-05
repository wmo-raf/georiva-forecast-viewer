import { describe, expect, it } from "vitest";
import {
  cellOf,
  dayCells,
  nearestStepInCell,
  progressWithin,
  stepAtFraction,
  stepLabel,
  tooltipAnchor,
} from "./daystrip";

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
    expect(progressWithin(times, 0)).toBeCloseTo(0.5);
    expect(progressWithin(times, 3)).toBeCloseTo(0.875);
    expect(progressWithin(times, 4)).toBe(0);
  });

  it("has no cells for an empty run", () => {
    expect(dayCells([])).toEqual([]);
  });
});

describe("picking a step from a point on the strip", () => {
  const cells = dayCells(times);

  it("picks the step nearest that point of the day", () => {
    // Cell 0 holds 12:00, 15:00, 18:00 and 21:00 — 0.5 to 0.875 of its width.
    expect(stepAtFraction(times, cells, 0 / 3)).toBe(0);
    expect(stepAtFraction(times, cells, 0.6 / 3)).toBe(1);
    expect(stepAtFraction(times, cells, 0.9 / 3)).toBe(3);
  });

  it("reads the fraction across the whole strip, cell first", () => {
    // Half way along three cells is the middle of cell 1, whose steps are
    // 00:00 and 03:00; 03:00 is the nearer.
    expect(stepAtFraction(times, cells, 0.5)).toBe(5);
    expect(stepAtFraction(times, cells, 1 / 3)).toBe(4);
  });

  it("holds on to the nearest end outside the strip", () => {
    expect(stepAtFraction(times, cells, -0.4)).toBe(0);
    expect(stepAtFraction(times, cells, 1)).toBe(6);
    expect(stepAtFraction(times, cells, 2.5)).toBe(6);
  });

  it("is the inverse of the playhead: every step round-trips", () => {
    times.forEach((_, step) => {
      const cell = cellOf(cells, step)!;
      const playhead = (cells.indexOf(cell) + progressWithin(times, step)) / cells.length;
      expect(stepAtFraction(times, cells, playhead)).toBe(step);
    });
  });

  it("has a step to give for a run with no cells", () => {
    expect(stepAtFraction([], [], 0.5)).toBe(0);
  });

  it("picks within one cell for a click on it", () => {
    expect(nearestStepInCell(times, cells[0], 0.49)).toBe(0);
    expect(nearestStepInCell(times, cells[1], 1)).toBe(5);
  });
});

describe("anchoring the tooltip over the playhead", () => {
  it("centres the box on the playhead with room on both sides", () => {
    expect(tooltipAnchor(300, 140, 600)).toEqual({ left: 300, arrow: 70 });
  });

  it("holds the box inside the strip and slides the arrow to the playhead", () => {
    expect(tooltipAnchor(0, 140, 600)).toEqual({ left: 70, arrow: 12 });
    expect(tooltipAnchor(40, 140, 600)).toEqual({ left: 70, arrow: 40 });
    expect(tooltipAnchor(600, 140, 600)).toEqual({ left: 530, arrow: 128 });
  });

  it("keeps the arrow clear of the box's own corners", () => {
    expect(tooltipAnchor(2, 140, 600).arrow).toBe(12);
    expect(tooltipAnchor(598, 140, 600).arrow).toBe(128);
  });

  it("centres a label too wide to be held, and lets the arrow travel", () => {
    expect(tooltipAnchor(10, 200, 100)).toEqual({ left: 50, arrow: 60 });
  });

  it("falls back to the playhead before anything has been measured", () => {
    expect(tooltipAnchor(123, 0, 0)).toEqual({ left: 123, arrow: 0 });
  });
});

describe("naming one step", () => {
  it("gives the UTC weekday, day of month and time of day", () => {
    expect(stepLabel(times[1])).toBe("Tue 3 · 15:00 UTC");
    expect(stepLabel(times[4])).toBe("Wed 4 · 00:00 UTC");
  });

  it("reads a step in another zone as the UTC time it is", () => {
    // The same instant, written +03:00: a forecast time must not shift by the
    // zone it happens to be written in, or it would leave its own cell.
    expect(stepLabel("2026-11-03T18:00:00+03:00")).toBe("Tue 3 · 15:00 UTC");
  });
});
