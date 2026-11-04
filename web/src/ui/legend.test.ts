import { describe, expect, it } from "vitest";
import type { PaletteStop } from "../api/types";
import { legendBar } from "./legend";

const BLACK_TO_WHITE: PaletteStop[] = [
  [0, [0, 0, 0]],
  [25, [128, 128, 128]],
  [50, [255, 255, 255]],
];

describe("the bar a palette draws", () => {
  it("places each stop at its share of the range", () => {
    const bar = legendBar(BLACK_TO_WHITE, 0, 50);
    expect(bar?.gradient).toBe(
      "linear-gradient(to right, rgba(0,0,0,1) 0.0%, rgba(128,128,128,1) 50.0%, rgba(255,255,255,1) 100.0%)",
    );
  });

  it("carries a stop's own alpha, which a palette uses for a transparent low end", () => {
    const bar = legendBar([
      [0, [0, 0, 0, 0]],
      [10, [0, 0, 255, 255]],
    ]);
    expect(bar?.gradient).toContain("rgba(0,0,0,0) 0.0%");
    expect(bar?.gradient).toContain("rgba(0,0,255,1) 100.0%");
  });

  it("spans the range EDR gives, not the stops' own span", () => {
    // `palette_min`/`palette_max` are the hint for display (core's render
    // contract); a palette whose stops stop short of them must not stretch to
    // fill the bar, or the colours would not line up with the map.
    const bar = legendBar(BLACK_TO_WHITE, -50, 50);
    expect(bar?.gradient).toContain("rgba(0,0,0,1) 50.0%");
    expect(bar?.ticks[0]).toEqual({ value: 0, label: "0", at: 50 });
  });

  it("falls back to the stops' own span when EDR gives no range", () => {
    expect(legendBar(BLACK_TO_WHITE)?.ticks.at(-1)?.at).toBe(100);
    expect(legendBar(BLACK_TO_WHITE, null, null)?.ticks.at(-1)?.at).toBe(100);
  });

  it("labels a stop to three significant figures, and a large one to none", () => {
    const ticks = legendBar([
      [1013.25, [0, 0, 0]],
      [1.23456, [1, 1, 1]],
    ])?.ticks;
    expect(ticks?.map((t) => t.label)).toEqual(["1.23", "1013"]);
  });

  it("reads the span from the stops' values rather than their order", () => {
    // Nothing in the style editor's snapshot promises the stops arrive sorted.
    const shuffled: PaletteStop[] = [BLACK_TO_WHITE[2], BLACK_TO_WHITE[0], BLACK_TO_WHITE[1]];
    expect(legendBar(shuffled)).toEqual(legendBar(BLACK_TO_WHITE));
  });

  it("labels about six of the palette's own stops, including both ends", () => {
    const many: PaletteStop[] = Array.from({ length: 21 }, (_, i) => [i, [i, i, i]] as PaletteStop);
    const ticks = legendBar(many)?.ticks ?? [];
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks[0].value).toBe(0);
    expect(ticks.at(-1)).toEqual({ value: 20, label: "20", at: 100 });
  });

  it("has nothing to draw without a palette", () => {
    expect(legendBar(null)).toBeNull();
    expect(legendBar([])).toBeNull();
  });

  it("has nothing to draw for a range of one value", () => {
    // A single-stop palette, or a variable whose range collapsed: a bar would
    // divide by zero and the ticks would stack on one point.
    expect(legendBar([[5, [1, 2, 3]]])).toBeNull();
    expect(legendBar(BLACK_TO_WHITE, 10, 10)).toBeNull();
  });
});
