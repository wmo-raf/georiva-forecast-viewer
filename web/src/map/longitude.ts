/**
 * The one place the viewer deals with a world that repeats.
 *
 * MapLibre reports a view panned over the antimeridian as longitudes beyond
 * ±180 rather than wrapping them, and the basemap draws a copy of the world
 * either side. So anything comparing a longitude against the data's own
 * rectangle — the particle budget's overlap, a value looked up at a point —
 * has to try the rectangle and its two copies rather than the rectangle alone.
 */

export const WORLD_LONGITUDES = 360;

/** The data rectangle's own offset, and its copies one world east and west. */
export const WORLD_SHIFTS = [0, -WORLD_LONGITUDES, WORLD_LONGITUDES];
