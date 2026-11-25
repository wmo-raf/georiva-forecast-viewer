import { describe, expect, it } from "vitest";

import { decode, fraction, LAYER_UNSCALE, layerPalette, renderContractGap } from "./colourTable";

/**
 * The pairs core's `colour_table.decode` gives (wmo-raf/georiva
 * `core/machine_plane/colour_table.py`): the viewer decodes a code to the value
 * every other GeoRiva surface reads off it.
 */
describe("decode", () => {
  it("decodes a linear code straight over the served range", () => {
    // core's test_the_browser_decodes_a_code_into_the_served_value: code 51 over −40…50 is −22.
    expect(decode(51, [-40, 50], { curve: "linear", range: [-40, 50] })).toBeCloseTo(-22);
  });

  it("decodes linearly when there is no encoding", () => {
    expect(decode(51, [-40, 50])).toBeCloseTo(-22);
    expect(decode(51, [-40, 50], null)).toBeCloseTo(-22);
  });

  it("squares a sqrt code's fraction", () => {
    // core: decode(51, 0, 300, "sqrt") = (51/255)² · 300 = 12.
    expect(decode(51, [0, 300], { curve: "sqrt", range: [0, 300] })).toBeCloseTo(12);
  });

  it("decodes a log code over the stored range", () => {
    // core: decode(85, 1, 1000, "log") = 1000^(85/255) = 10.
    expect(decode(85, [1, 1000], { curve: "log", range: [1, 1000] })).toBeCloseTo(10);
  });

  it("takes a log code's fraction over the stored range, then reads it off the served one", () => {
    // Stored in m, served in mm: the same fraction of a range a thousand times larger.
    const encoding = { curve: "log" as const, range: [1, 1000] as [number, number] };
    expect(decode(85, [1000, 1_000_000], encoding)).toBeCloseTo(1000 + ((10 - 1) / 999) * 999_000);
  });

  it("keeps both ends of the range at both ends of the codes, whatever the curve", () => {
    for (const curve of ["linear", "sqrt", "log"] as const) {
      const encoding = { curve, range: [1, 100] as [number, number] };
      expect(fraction(0, encoding)).toBeCloseTo(0);
      expect(fraction(255, encoding)).toBeCloseTo(1);
    }
  });
});

describe("layerPalette", () => {
  it("puts each colour of the table at its own code", () => {
    const table = Array.from({ length: 256 }, (_, code) => [code, 0, 0, code === 0 ? 0 : 255] as [number, number, number, number]);
    const palette = layerPalette(table);
    expect(palette).toHaveLength(256);
    expect(palette[0]).toEqual([0, [0, 0, 0, 0]]);
    expect(palette[200]).toEqual([200, [200, 0, 0, 255]]);
  });

  it("draws a table that is not there as grayscale over the codes", () => {
    expect(layerPalette(null)).toEqual([
      [0, [0, 0, 0, 255]],
      [255, [255, 255, 255, 255]],
    ]);
    expect(layerPalette([])).toEqual(layerPalette(undefined));
  });

  it("unscales by identity, so a code is the table's index", () => {
    expect(LAYER_UNSCALE).toEqual([0, 255]);
  });
});

describe("renderContractGap", () => {
  const contract = {
    image_unscale: [0, 1] as [number, number],
    colour_table: [],
    encoding: { curve: "linear" as const, range: [0, 1] as [number, number] },
    legend: { gradient: [], ticks: [], under: "clamp" as const, over: "clamp" as const },
  };

  it("has nothing to say about a parameter that carries the whole contract", () => {
    expect(renderContractGap({ label: "t", "x-georiva": contract })).toBeNull();
    expect(renderContractGap(null)).toBeNull();
  });

  it("names the core a parameter without one needs, and what it lacks", () => {
    const old = { label: "t", "x-georiva": { image_unscale: [0, 1] as [number, number] } };
    expect(renderContractGap(old)).toBe(
      "this viewer needs GeoRiva core 0.5.0 or later: the variable's description carries no colour_table, encoding, legend",
    );
  });
});
