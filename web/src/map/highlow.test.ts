import { describe, expect, it } from "vitest";
import { highLowRadiusKm, pressureLabel } from "./highlow";

describe("the H/L search radius, from the texture's extent", () => {
  it("is the synoptic 2000 km for a global source", () => {
    expect(highLowRadiusKm([-180, -90, 180, 90])).toBe(2000);
  });

  it("stays at 2000 km for a continental crop", () => {
    // Africa as IFS is often cropped: about 8 900 km tall, so a quarter is well past the cap.
    expect(highLowRadiusKm([-20, -40, 55, 40])).toBe(2000);
  });

  it("is a quarter of the shorter side for a regional domain", () => {
    // 12° square on the equator: about 1 334 km a side.
    const radius = highLowRadiusKm([30, -6, 42, 6]);
    expect(radius).toBeGreaterThan(325);
    expect(radius).toBeLessThan(340);
  });

  it("measures longitude at the domain's own latitude, where a degree is shorter", () => {
    // 40° wide but centred on 60° N, so about 2 224 km wide against 2 669 km tall: the width is the shorter side.
    const radius = highLowRadiusKm([0, 48, 40, 72]);
    expect(radius).toBeGreaterThan(545);
    expect(radius).toBeLessThan(565);
  });

  it("never drops below 300 km, however small the domain", () => {
    expect(highLowRadiusKm([36, -2, 38, 0])).toBe(300);
  });
});

describe("an H/L label", () => {
  it("reads hectopascals from a texture stored in pascals", () => {
    expect(pressureLabel(99620, 0.01)).toBe("996");
  });

  it("rounds to the whole hectopascal, as a chart does", () => {
    expect(pressureLabel(1013.6, 1)).toBe("1014");
  });
});
