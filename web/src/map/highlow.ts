/**
 * The two facts the H/L layer needs that the map has to work out itself.
 *
 * WeatherLayers' `HighLowLayer` smooths the field, keeps each pixel that is a
 * strict extreme over all eight neighbours (never the outermost row or column),
 * then drops any weaker extreme within `radius` km of a stronger one. Two
 * consequences shape this file:
 *
 * - The radius is a fact about the grid's extent, not a preference. 2000 km
 *   gives a handful of synoptic systems over a continent, but over a 3 km WRF
 *   domain a few hundred kilometres across it would leave one H and one L at
 *   most. So it scales with the domain, from the texture's own bounds.
 * - Nothing here suppresses extremes at the domain's edge: the layer's own
 *   rule already does what that would. A gradient running into the edge
 *   leaves the pixel beside it lower than the edge pixel, so no false centre
 *   appears there. (The layer could not be filtered by position anyway; it
 *   takes no data prop, and its label function is handed the value alone.)
 */

/** Kilometres per degree along a great circle, on the mean-radius sphere. */
const KM_PER_DEGREE = (Math.PI * 6371) / 180;

/** The synoptic radius a global or continental source gets. */
const MAX_RADIUS_KM = 2000;
/** The least a domain gets, so a small one is not labelled cell by cell. */
const MIN_RADIUS_KM = 300;
/** The radius as a share of the domain's shorter side; tuned by eye against IFS and a WRF domain. */
const SHARE_OF_DOMAIN = 1 / 4;

/** How far apart two highs (or two lows) must be to both be labelled, for a texture covering `bounds`. */
export function highLowRadiusKm([west, south, east, north]: readonly [number, number, number, number]): number {
  const midLatitude = ((south + north) / 2) * (Math.PI / 180);
  const width = (east - west) * KM_PER_DEGREE * Math.cos(midLatitude);
  const height = (north - south) * KM_PER_DEGREE;
  const radius = Math.min(width, height) * SHARE_OF_DOMAIN;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, radius));
}

/**
 * A centre's value as a chart prints it: whole hectopascals, no unit.
 *
 * The texture is in the variable's stored unit; `toHpa` is the catalogue's
 * factor for it, so this one multiplication is all the unit handling the web
 * does.
 */
export function pressureLabel(value: number, toHpa: number): string {
  return String(Math.round(value * toHpa));
}
