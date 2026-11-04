/**
 * Wind as a reader expects it: a speed, and the direction it blows *from*.
 *
 * The textures carry u and v — eastward and northward components — because
 * that is what a particle layer integrates. Nobody reads a forecast that way,
 * so anything showing a wind to a person converts here first. The convention
 * is the one `docs/wind-direction-check.md` records as checked against both
 * models' source data: bearing clockwise from north, naming where the air
 * comes from, which is what "a 10 knot easterly" means.
 */

/** The magnitude of the pair, in whatever unit the components are in. */
export function windSpeed(u: number, v: number): number {
  return Math.hypot(u, v);
}

/**
 * Degrees clockwise from north, naming where the wind comes from, or `null`
 * for a wind with no direction.
 *
 * Both components exactly zero has no bearing to report: `atan2(0, 0)` is zero
 * and would answer "westerly" for still air. An 8-bit texture lands there
 * often enough in light wind, since one quantisation step can be a whole
 * metre per second (ADR 0021).
 */
export function windBearing(u: number, v: number): number | null {
  if (u === 0 && v === 0) return null;
  return (((270 - (Math.atan2(v, u) * 180) / Math.PI) % 360) + 360) % 360;
}

const POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/** The sixteenth of the compass a bearing falls in, as its name. */
export function compassPoint(bearing: number): string {
  return POINTS[Math.round(bearing / (360 / POINTS.length)) % POINTS.length];
}
