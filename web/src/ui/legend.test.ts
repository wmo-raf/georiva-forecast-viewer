import { describe, expect, it } from "vitest";
import type { Rgba, ServerLegend } from "../api/types";
import { extent, fitting, label, legendBar } from "./legend";

const BLUE: Rgba = [0, 0, 255, 255];
const RED: Rgba = [255, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];

/** Core's layout of a three-class stepped style: equal blocks, a tick at each boundary. */
const STEPPED: ServerLegend = {
  gradient: [
    [0, BLUE],
    [0.333333, BLUE],
    [0.333333, WHITE],
    [0.666667, WHITE],
    [0.666667, RED],
    [1, RED],
  ],
  ticks: [
    [0, 0],
    [0.333333, 0.5],
    [0.666667, 10],
    [1, 200],
  ],
  labels: [0, 1, 2, 3],
  stepped: true,
  under: "transparent",
  over: "clamp",
};

/** A continuous style laid out along a sqrt curve: the low end stretched. */
const CONTINUOUS: ServerLegend = {
  gradient: [
    [0, BLUE],
    [0.6, WHITE],
    [1, RED],
  ],
  ticks: [
    [0, 0],
    [0.6, 36],
    [1, 100],
  ],
  labels: [0, 2],
  stepped: false,
  under: "clamp",
  over: "clamp",
};

describe("legendBar", () => {
  it("has nothing to draw without a legend", () => {
    expect(legendBar(null)).toBeNull();
    expect(legendBar(undefined)).toBeNull();
  });

  it("draws core's gradient where core put it", () => {
    const bar = legendBar(STEPPED)!;
    expect(bar.gradient).toBe(
      "linear-gradient(to right, rgba(0,0,255,1) 0.00%, rgba(0,0,255,1) 33.33%, rgba(255,255,255,1) 33.33%, " +
        "rgba(255,255,255,1) 66.67%, rgba(255,0,0,1) 66.67%, rgba(255,0,0,1) 100.00%)",
    );
  });

  it("labels the ticks core picked, at core's positions, and no others", () => {
    const bar = legendBar(CONTINUOUS)!;
    expect(bar.labels.map((tick) => [tick.index, tick.text, tick.at])).toEqual([
      [0, "0", 0],
      [2, "100", 100],
    ]);
  });

  it("labels at most six ticks when core does not say which", () => {
    const ticks = Array.from({ length: 11 }, (_, i) => [i / 10, i] as [number, number]);
    const bar = legendBar({ ...CONTINUOUS, ticks, labels: undefined })!;
    expect(bar.labels.map((tick) => tick.index)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("keeps the ends on the bar", () => {
    const aligns = legendBar(STEPPED)!.labels.map((tick) => tick.align);
    expect(aligns).toEqual(["start", "middle", "middle", "end"]);
  });

  it("draws an arrow only on a clamped end, in that end's colour", () => {
    const stepped = legendBar(STEPPED)!;
    expect(stepped.under).toBeNull();
    expect(stepped.over).toBe("rgb(255,0,0)");

    const continuous = legendBar(CONTINUOUS)!;
    expect(continuous.under).toBe("rgb(0,0,255)");
    expect(continuous.over).toBe("rgb(255,0,0)");
  });

  it("only lets a stepped legend's labels thin", () => {
    expect(legendBar(STEPPED)!.stepped).toBe(true);
    expect(legendBar(CONTINUOUS)!.stepped).toBe(false);
  });

  it("picks text that reads on the band a boundary label starts", () => {
    // 0.5 sits where white begins: dark text. 10 sits where red begins: light text.
    const colours = legendBar(STEPPED)!.labels.map((tick) => tick.textColour);
    expect(colours).toEqual(["#fff", "#111", "#fff", "#fff"]);
  });

  it("reads a transparent band against the pill, not the map", () => {
    const clear: ServerLegend = { ...CONTINUOUS, gradient: [[0, [255, 255, 255, 0]], [1, [255, 255, 255, 0]]] };
    expect(legendBar(clear)!.labels.every((tick) => tick.textColour === "#fff")).toBe(true);
  });

  it("draws a legend with no gradient as grayscale", () => {
    expect(legendBar({ ...CONTINUOUS, gradient: [] })!.gradient).toBe("linear-gradient(to right, #000, #fff)");
  });
});

describe("label", () => {
  it("prints values as core's legends do", () => {
    expect(label(0.5)).toBe("0.5");
    expect(label(1)).toBe("1");
    expect(label(200)).toBe("200");
    expect(label(26.85)).toBe("26.9");
    expect(label(2.85)).toBe("2.85");
    expect(label(0)).toBe("0");
    expect(label(0.00005)).toBe("5.0e-5");
    expect(label(250000)).toBe("2.5e+5");
  });
});

describe("fitting", () => {
  it("shows every label that fits", () => {
    expect(
      fitting([
        [0, 10],
        [20, 30],
        [40, 50],
      ]),
    ).toEqual([0, 1, 2]);
  });

  it("thins to every second, then third, keeping both ends", () => {
    // Each 10 wide, 12 apart: neighbours overlap, every second one clears.
    const crowded = Array.from({ length: 5 }, (_, i) => [i * 12, i * 12 + 10] as [number, number]);
    expect(fitting(crowded)).toEqual([0, 2, 4]);
  });

  it("leaves the first alone when even the ends overlap", () => {
    expect(
      fitting([
        [0, 30],
        [10, 40],
      ]),
    ).toEqual([0]);
  });

  it("has nothing to pick from no labels", () => {
    expect(fitting([])).toEqual([]);
  });
});

describe("extent", () => {
  it("hangs a label off its point as it is aligned", () => {
    expect(extent(0, 20, 200, "start")).toEqual([0, 20]);
    expect(extent(50, 20, 200, "middle")).toEqual([90, 110]);
    expect(extent(100, 20, 200, "end")).toEqual([180, 200]);
  });
});
