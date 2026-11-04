import { describe, expect, it } from "vitest";
import { BASE_PARTICLES, MAX_BOOST, type Bounds, particleCount, visibleFraction } from "./particles";

const WORLD: Bounds = [-180, -90, 180, 90];
/** A regional domain roughly the size of the KMD WRF grid. */
const REGION: Bounds = [33, -5, 43, 5];

describe("how much of the viewport the data covers", () => {
  it("is all of it for a global grid on a global view", () => {
    expect(visibleFraction(WORLD, WORLD)).toBe(1);
  });

  it("is all of it when the grid is larger than the view", () => {
    expect(visibleFraction(WORLD, REGION)).toBe(1);
  });

  it("is the overlapping rectangle's share of the view", () => {
    // Half the longitudes and half the latitudes of the viewport.
    expect(visibleFraction([0, 0, 10, 10], [0, 0, 20, 20])).toBeCloseTo(0.25);
  });

  it("is nothing when the grid is off screen", () => {
    expect(visibleFraction(REGION, [-120, 20, -100, 40])).toBe(0);
  });

  it("counts a grid the view reaches by wrapping past the antimeridian", () => {
    // MapLibre reports longitudes beyond ±180 rather than wrapping them.
    expect(visibleFraction([170, -10, 180, 10], [170, -10, 200, 10])).toBeCloseTo(1 / 3);
    expect(visibleFraction([-180, -10, -170, 10], [170, -10, 200, 10])).toBeCloseTo(1 / 3);
  });

  it("is all of it for a view with no extent of its own", () => {
    expect(visibleFraction(WORLD, [10, 10, 10, 10])).toBe(1);
  });
});

describe("the particle budget follows the data's share of the view", () => {
  it("spends the base count on a grid that fills the view", () => {
    expect(particleCount(WORLD, WORLD)).toBe(BASE_PARTICLES);
  });

  it("spends the base count before a viewport is known", () => {
    expect(particleCount(WORLD, null)).toBe(BASE_PARTICLES);
    expect(particleCount(null, WORLD)).toBe(BASE_PARTICLES);
  });

  it("buys back the density a regional grid loses on a wide view", () => {
    // A quarter of the view: four times the particles keeps the same density
    // over the domain as a global grid has over the whole view.
    expect(particleCount([0, 0, 10, 10], [0, 0, 20, 20])).toBe(BASE_PARTICLES * 4);
  });

  it("moves in powers of two, so panning does not reallocate on every frame", () => {
    const counts = new Set<number>();
    for (let span = 20; span <= 40; span += 1) counts.add(particleCount([0, 0, 10, 10], [0, 0, span, span]));
    for (const count of counts) expect(Math.log2(count / BASE_PARTICLES) % 1).toBe(0);
    expect(counts.size).toBeLessThan(5);
  });

  it("stops boosting at the cap, however small the domain", () => {
    expect(particleCount([0, 0, 0.1, 0.1], WORLD)).toBe(BASE_PARTICLES * MAX_BOOST);
  });

  it("spends the base count when none of the grid is in view", () => {
    expect(particleCount(REGION, [-120, 20, -100, 40])).toBe(BASE_PARTICLES);
  });
});
