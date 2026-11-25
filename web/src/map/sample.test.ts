import { describe, expect, it } from "vitest";
import { readValue, readVector } from "./sample";
import type { Texture } from "./texture";

/**
 * A texture of `width` × `height` pixels, each given as `[r, g, b, a]` in the
 * browser's row-major order: the first row is the northern edge.
 *
 * The default unscale `[0, 255]` makes a channel its own value, so a test can
 * say which pixel it expects rather than what that pixel decodes to.
 */
function texture(
  width: number,
  height: number,
  pixels: [number, number, number, number][],
  bounds: Texture["bounds"] = [-180, -90, 180, 90],
  unscale: Texture["unscale"] = [0, 255],
): Texture {
  return { image: { data: new Uint8ClampedArray(pixels.flat()), width, height }, bounds, unscale, curve: "linear" };
}

const OPAQUE = 255;
const NODATA = 0;

/** Four pixels over the world: north-west 10, north-east 20, south-west 30, south-east 40. */
const QUARTERS = texture(2, 2, [
  [10, 0, 0, OPAQUE],
  [20, 0, 0, OPAQUE],
  [30, 0, 0, OPAQUE],
  [40, 0, 0, OPAQUE],
]);

describe("the value under a point", () => {
  it("is the pixel the point falls in", () => {
    expect(readValue(QUARTERS, -90, 45)).toBe(10);
    expect(readValue(QUARTERS, 90, 45)).toBe(20);
    expect(readValue(QUARTERS, -90, -45)).toBe(30);
    expect(readValue(QUARTERS, 90, -45)).toBe(40);
  });

  it("reads the first row as the northern edge", () => {
    // The PNG is top-down while latitudes count up, which is the one place a
    // sampled texture can silently come out mirrored.
    expect(readValue(QUARTERS, -90, 89)).toBe(10);
    expect(readValue(QUARTERS, -90, -89)).toBe(30);
  });

  it("keeps the far edges inside the grid", () => {
    expect(readValue(QUARTERS, 180, 90)).toBe(20);
    expect(readValue(QUARTERS, -180, -90)).toBe(30);
  });

  it("unscales the channel over the range the texture was encoded with", () => {
    const celsius = texture(1, 1, [[128, 0, 0, OPAQUE]], [-180, -90, 180, 90], [-50, 50]);
    expect(readValue(celsius, 0, 0)).toBeCloseTo(-50 + (100 * 128) / 255);
  });

  it("is nothing outside the texture's own rectangle", () => {
    // A regional domain: ADR 0038 clipping and a WRF grid both leave most of
    // the map with no texture over it at all.
    const region = texture(1, 1, [[7, 0, 0, OPAQUE]], [33, -5, 43, 5]);
    expect(readValue(region, 36, 0)).toBe(7);
    expect(readValue(region, 60, 0)).toBeNull();
    expect(readValue(region, 36, 40)).toBeNull();
  });

  it("is nothing where the texture says it has no data", () => {
    // Masked pixels come back with alpha 0 — how the tile server reports both
    // a nodata cell and the area a display clip crops away (ADR 0038).
    const holed = texture(1, 1, [[99, 0, 0, NODATA]]);
    expect(readValue(holed, 0, 0)).toBeNull();
  });

  it("is nothing for a texture with no extent to index", () => {
    expect(readValue(texture(1, 1, [[5, 0, 0, OPAQUE]], [10, 10, 10, 10]), 10, 10)).toBeNull();
  });

  it("follows a cursor panned past the antimeridian onto the data", () => {
    // MapLibre reports longitudes beyond ±180 rather than wrapping them, and
    // the basemap repeats the world, so the data really is under the cursor.
    const east = texture(1, 1, [[11, 0, 0, OPAQUE]], [170, -10, 180, 10]);
    const west = texture(1, 1, [[22, 0, 0, OPAQUE]], [-180, -10, -170, 10]);
    expect(readValue(east, 535, 0)).toBe(11);
    expect(readValue(west, 185, 0)).toBe(22);
    expect(readValue(east, -185, 0)).toBe(11);
  });

  it("decodes the code through the variable's encoding curve, as core does", () => {
    // A sqrt variable over 0–300: code 51 is (51/255)² of the range, 12, not the linear 60.
    const rain = texture(1, 1, [[51, 0, 0, OPAQUE]], [-180, -90, 180, 90], [0, 300]);
    expect(readValue(rain, 0, 0, { curve: "sqrt", range: [0, 300] })).toBeCloseTo(12);
    expect(readValue(rain, 0, 0)).toBeCloseTo(60);
  });

  it("reads a value where the style draws nothing: transparency is the colour's, not the texture's", () => {
    // Code 0 is below a style whose under is transparent; the texture still holds a value there.
    const dry = texture(1, 1, [[0, 0, 0, OPAQUE]], [-180, -90, 180, 90], [0, 300]);
    expect(readValue(dry, 0, 0, { curve: "sqrt", range: [0, 300] })).toBe(0);
  });
});

describe("the wind pair under a point", () => {
  const pair = texture(
    2,
    1,
    [
      [255, 0, 0, OPAQUE],
      [0, 255, 0, NODATA],
    ],
    [-180, -90, 180, 90],
    [-20, 20],
  );

  it("takes u from red and v from green, over the one shared range", () => {
    // Both bands are encoded over the union of the two variables' ranges
    // (core's #593), so one unscale decodes both and the angle is the source's.
    expect(readVector(pair, -90, 0)).toEqual({ u: 20, v: -20 });
  });

  it("is nothing where either component is missing", () => {
    expect(readVector(pair, 90, 0)).toBeNull();
  });

  it("is nothing outside the texture", () => {
    const region = texture(1, 1, [[255, 255, 0, OPAQUE]], [33, -5, 43, 5], [-20, 20]);
    expect(readVector(region, 60, 0)).toBeNull();
  });
});
