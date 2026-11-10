import { describe, expect, it } from "vitest";
import { isobarPalette } from "./isobars";

describe("the isobars' colours, by the pressure each line is drawn at", () => {
  it("runs from blue lows through the pale-green normal band to cream highs", () => {
    expect(isobarPalette(1)).toEqual([
      [970, [74, 134, 209, 191]],
      [990, [94, 194, 214, 191]],
      [1005, [155, 230, 196, 191]],
      [1013, [198, 251, 196, 191]],
      [1022, [238, 245, 194, 191]],
      [1032, [243, 223, 166, 191]],
    ]);
  });

  it("puts the same colours at the same pressures for a texture stored in pascals", () => {
    const palette = isobarPalette(0.01);
    expect(palette.map(([value]) => value)).toEqual([97000, 99000, 100500, 101300, 102200, 103200]);
    expect(palette.map(([, colour]) => colour)).toEqual(isobarPalette(1).map(([, colour]) => colour));
  });
});
