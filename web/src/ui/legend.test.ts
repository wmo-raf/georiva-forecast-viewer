import { describe, expect, it } from "vitest";
import type { PaletteStop } from "../api/types";
import { legendBar } from "./legend";

const BLACK_TO_WHITE: PaletteStop[] = [
  [0, [0, 0, 0]],
  [25, [128, 128, 128]],
  [50, [255, 255, 255]],
];

/** As core's stepped mode emits them: each class two stops of one colour. */
function classes(bands: [number, number, [number, number, number]][]): PaletteStop[] {
  return bands.flatMap(([low, high, colour]): PaletteStop[] => [
    [low, colour],
    [high, colour],
  ]);
}

const RAIN = classes([
  [0, 1, [0, 0, 60]],
  [1, 5, [0, 0, 200]],
  [5, 20, [255, 255, 255]],
]);

function continuous(palette: PaletteStop[] | null | undefined, min?: number | null, max?: number | null) {
  const bar = legendBar(palette, min, max);
  if (bar && bar.kind !== "continuous") throw new Error("expected a ramp, got a classification");
  return bar;
}

function stepped(palette: PaletteStop[], unit = "") {
  const bar = legendBar(palette, null, null, unit);
  if (!bar || bar.kind !== "stepped") throw new Error("expected a classification, got a ramp");
  return bar;
}

describe("the bar a ramp draws", () => {
  it("places each stop at its share of the range", () => {
    expect(continuous(BLACK_TO_WHITE, 0, 50)?.gradient).toBe(
      "linear-gradient(to right, rgba(0,0,0,1) 0.0%, rgba(128,128,128,1) 50.0%, rgba(255,255,255,1) 100.0%)",
    );
  });

  it("carries a stop's own alpha, which a palette uses for a transparent low end", () => {
    const bar = continuous([
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
    const bar = continuous(BLACK_TO_WHITE, -50, 50);
    expect(bar?.gradient).toContain("rgba(0,0,0,1) 50.0%");
    expect(bar?.ticks[0]).toMatchObject({ value: 0, label: "0", at: 50 });
  });

  it("falls back to the stops' own span when EDR gives no range", () => {
    expect(continuous(BLACK_TO_WHITE)?.ticks.at(-1)?.at).toBe(100);
    expect(continuous(BLACK_TO_WHITE, null, null)?.ticks.at(-1)?.at).toBe(100);
  });

  it("labels a stop to three significant figures, and a large one to none", () => {
    const ticks = continuous([
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
    const ticks = continuous(many)?.ticks ?? [];
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks[0].value).toBe(0);
    expect(ticks.at(-1)).toMatchObject({ value: 20, label: "20", at: 100 });
  });

  it("reads a value off the colour the gradient actually has there", () => {
    // The tick sits on the ramp now, so its own colour decides the text: dark
    // at the white end, light at the black one.
    const ticks = continuous(BLACK_TO_WHITE)?.ticks ?? [];
    expect(ticks[0].textColour).toBe("#fff");
    expect(ticks.at(-1)?.textColour).toBe("#111");
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

describe("the blocks a classification draws", () => {
  it("folds core's paired stops back into one block per class", () => {
    // Stepped mode emits each class as two stops sharing its boundaries; that
    // pairing is the class list, and nothing else in the payload says so.
    expect(stepped(RAIN).classes.map((band) => band.value)).toEqual([0, 1, 5]);
  });

  it("prints a class's lower boundary, and keeps its full range as a title", () => {
    const [first, , last] = stepped(RAIN, "mm").classes;
    expect(first.label).toBe("0");
    expect(first.title).toBe("0 – 1 mm");
    expect(last.title).toBe("5 – 20 mm");
  });

  it("leaves the unit off a title when the variable has none", () => {
    expect(stepped(RAIN).classes[0].title).toBe("0 – 1");
  });

  it("ignores the display range, since the blocks are equal and not an axis", () => {
    expect(legendBar(RAIN, -100, 100)).toEqual(legendBar(RAIN));
  });

  it("labels every block of a palette the pill has room to label", () => {
    const bands = Array.from(
      { length: 12 },
      (_, i): [number, number, [number, number, number]] => [i, i + 1, [i * 20, i * 20, i * 20]],
    );
    const drawn = stepped(classes(bands)).classes;
    expect(drawn.every((band) => band.label !== null)).toBe(true);
  });

  it("draws every class but labels at most twelve, always including the first", () => {
    const bands = Array.from(
      { length: 25 },
      (_, i): [number, number, [number, number, number]] => [i, i + 1, [i, i, i]],
    );
    const many = classes(bands);
    const drawn = stepped(many).classes;
    expect(drawn).toHaveLength(25);
    const labelled = drawn.filter((band) => band.label !== null);
    expect(labelled.length).toBeLessThanOrEqual(12);
    expect(drawn[0].label).toBe("0");
    // Dropped only the label: the colour and its range are still there.
    expect(drawn[1].label).toBeNull();
    expect(drawn[1].title).toBe("1 – 2");
  });

  it("takes the text colour from the block it sits on", () => {
    const [dark, , light] = stepped(RAIN).classes;
    expect(dark.textColour).toBe("#fff");
    expect(light.textColour).toBe("#111");
  });

  it("composites a class onto the pill, so a transparent one is still a tint", () => {
    // The map draws this class invisible; the legend must not therefore paint
    // it a solid colour, nor let whatever is under the pill decide how it reads.
    const [clear, solid] = stepped([
      [0, [255, 255, 255, 0]],
      [1, [255, 255, 255, 0]],
      [1, [255, 255, 255, 255]],
      [2, [255, 255, 255, 255]],
    ]).classes;
    expect(clear.colour).toBe("rgb(18,26,40)");
    expect(clear.textColour).toBe("#fff");
    expect(solid.colour).toBe("rgb(255,255,255)");
  });

  it("draws a palette of one class as the single block it is", () => {
    // The ramp's divide-by-zero guard does not apply: there is no span to
    // divide by, only one colour that covers everything.
    const only = stepped(classes([[0, 50, [10, 20, 30]]])).classes;
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ value: 0, label: "0", title: "0 – 50" });
  });

  it("reads past a closing stop for everything above the range", () => {
    // Real palettes end with the colour for values off the top, declared as one
    // stop at the top itself: it names no interval and covers no area on the
    // map, so it is a boundary of the classification and not a class in it.
    const closed: PaletteStop[] = [...RAIN, [20, [139, 0, 0]]];
    const drawn = stepped(closed).classes;
    expect(drawn.map((band) => band.value)).toEqual([0, 1, 5]);
    expect(drawn.at(-1)?.title).toBe("5 – 20");
  });

  it("reads past an opening stop below the range too", () => {
    const opened: PaletteStop[] = [[0, [10, 10, 10]], ...RAIN];
    expect(stepped(opened).classes.map((band) => band.value)).toEqual([0, 1, 5]);
  });

  it("leaves a ramp that merely repeats a colour as a ramp", () => {
    // Two stops of one colour are only a class when they span values; a ramp
    // with a repeated colour at a single point is still a ramp.
    expect(
      continuous([
        [0, [0, 0, 0]],
        [10, [0, 0, 0]],
        [10, [255, 255, 255]],
        [20, [0, 0, 255]],
      ])?.kind,
    ).toBe("continuous");
  });
});
