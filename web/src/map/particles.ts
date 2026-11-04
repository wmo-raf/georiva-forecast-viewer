/**
 * The particle budget, which is where a regional grid differs from a global one.
 *
 * WeatherLayers seeds particles uniformly over the *viewport*, then freezes and
 * hides every one that falls outside the layer's `bounds` or on a nodata pixel.
 * A global IFS texture therefore spends the whole budget on live particles,
 * while a WRF domain covering a tenth of the view spends a tenth of it and
 * looks ten times thinner than the same wind in IFS. Nothing in the layer
 * compensates: `numParticles` is a flat count, and seeding cannot be confined
 * to the data.
 *
 * So the viewer sizes the budget itself, from the share of the view the data
 * covers. The measure is the overlap of two longitude/latitude rectangles,
 * which is the space particles are actually seeded in — not screen area, which
 * Mercator and the layer's own latitude easing both bend. It is an estimate
 * used to pick a particle count, and does not need to be better than that.
 *
 * The count moves in powers of two because changing `numParticles` reallocates
 * the layer's transform-feedback buffers: a continuous function of the viewport
 * would rebuild them on every pan, and the particle trails would restart each
 * time.
 */

/** A longitude/latitude rectangle: `[west, south, east, north]`. */
export type Bounds = [number, number, number, number];

/** Particles for a grid that fills the view; WeatherLayers' own default. */
export const BASE_PARTICLES = 5000;

/** The most the budget is multiplied by, so a tiny domain cannot ask for millions. */
export const MAX_BOOST = 8;

const WORLD_LONGITUDES = 360;

function overlap(lowA: number, highA: number, lowB: number, highB: number): number {
  return Math.max(0, Math.min(highA, highB) - Math.max(lowA, lowB));
}

/**
 * The share of `viewport` that `data` covers, from 0 to 1.
 *
 * Longitudes are compared against the data rectangle and its copies one world
 * east and west: MapLibre reports a view panned over the antimeridian as
 * longitudes beyond ±180 rather than wrapping them, and the basemap repeats the
 * world, so the data is genuinely on screen there. The copies cannot overlap
 * each other inside a view narrower than the world, and a wider view is clamped
 * to one world before the shares are added.
 *
 * A view with no extent — before the map has laid out — counts as fully
 * covered, which spends the base budget rather than boosting on a measurement
 * that does not exist yet.
 */
export function visibleFraction(data: Bounds, viewport: Bounds): number {
  const [west, south, east, north] = viewport;
  const longitudes = Math.min(east - west, WORLD_LONGITUDES);
  const latitudes = north - south;
  if (longitudes <= 0 || latitudes <= 0) return 1;

  const [dataWest, dataSouth, dataEast, dataNorth] = data;
  const covered = [-WORLD_LONGITUDES, 0, WORLD_LONGITUDES]
    .map((shift) => overlap(dataWest + shift, dataEast + shift, west, west + longitudes))
    .reduce((total, span) => total + span, 0);

  return Math.min(1, (covered / longitudes) * (overlap(dataSouth, dataNorth, south, north) / latitudes));
}

/**
 * How many particles to seed so the density over `data` is the same whatever
 * share of the view it occupies.
 *
 * `null` for either rectangle — no texture yet, or no map yet — spends the base
 * count, as does data entirely off screen, where every particle would be
 * dropped anyway and a boost would only cost GPU memory.
 */
export function particleCount(data: Bounds | null, viewport: Bounds | null, base = BASE_PARTICLES): number {
  if (!data || !viewport) return base;
  const fraction = visibleFraction(data, viewport);
  if (fraction <= 0) return base;
  const steps = Math.min(Math.max(Math.round(Math.log2(1 / fraction)), 0), Math.log2(MAX_BOOST));
  return base * 2 ** steps;
}
