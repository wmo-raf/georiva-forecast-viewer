import { describe, expect, it } from "vitest";
import { compassPoint, windBearing, windSpeed } from "./wind";

describe("wind speed", () => {
  it("is the magnitude of the two components", () => {
    expect(windSpeed(3, 4)).toBe(5);
    expect(windSpeed(-3, -4)).toBe(5);
    expect(windSpeed(0, 0)).toBe(0);
  });
});

describe("the direction the wind blows from", () => {
  // The same convention as docs/wind_direction_check.py, which checked it
  // against the source data: u eastward, v northward, bearing clockwise from
  // north and naming where the air comes *from*.
  it("calls a wind blowing north a southerly", () => {
    expect(windBearing(0, 1)).toBeCloseTo(180);
  });

  it("calls a wind blowing east a westerly", () => {
    expect(windBearing(1, 0)).toBeCloseTo(270);
  });

  it("calls a wind blowing west an easterly", () => {
    expect(windBearing(-1, 0)).toBeCloseTo(90);
  });

  it("calls a wind blowing south a northerly, as zero rather than 360", () => {
    expect(windBearing(0, -1)).toBeCloseTo(0);
  });

  it("puts a wind blowing north-east on the south-west diagonal", () => {
    expect(windBearing(1, 1)).toBeCloseTo(225);
  });

  it("stays inside one turn for every quadrant", () => {
    for (const [u, v] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [0.3, -2],
    ]) {
      const bearing = windBearing(u, v);
      expect(bearing).not.toBeNull();
      expect(bearing!).toBeGreaterThanOrEqual(0);
      expect(bearing!).toBeLessThan(360);
    }
  });

  it("has no direction when both components are zero", () => {
    // Quantisation can land a light wind exactly on zero in both bands
    // (ADR 0021), and `atan2(0, 0)` would answer a westerly.
    expect(windBearing(0, 0)).toBeNull();
  });
});

describe("the compass point a bearing falls in", () => {
  it("names the cardinals and the diagonals", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(225)).toBe("SW");
  });

  it("names the sixteenths between them", () => {
    expect(compassPoint(70)).toBe("ENE");
    expect(compassPoint(340)).toBe("NNW");
  });

  it("wraps the last sixteenth back to north", () => {
    expect(compassPoint(350)).toBe("N");
    expect(compassPoint(359.9)).toBe("N");
  });
});
