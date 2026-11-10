/**
 * The isobars' colours: each line in the colour of the pressure it is drawn at,
 * the way Windy draws them — blue around deep lows, pale green through the
 * band most of the tropics sits in, cream over the highs.
 *
 * Fixed here rather than taken from the pressure variable's own style in core,
 * for two reasons. A line's colour is part of how the chart reads, as the
 * basemap is, so it is the viewer's call. And the variable's palette paints the
 * same values as a raster: with mean sea level pressure selected as the raster
 * too, every line would be drawn in exactly the colour of the fill beneath it.
 *
 * Designed for rasters whose empty values are transparent or mid-tone. Over a
 * near-white fill (a precipitation palette that paints "no rain" opaque white)
 * the pastels vanish; the fix for that is the raster's lowest stop, not the lines.
 */

type Rgba = [number, number, number, number];

/** The lines' alpha: the hairline isobars sit over the raster rather than on it. */
const ALPHA = 191;

/**
 * The stops, in hPa. The layer interpolates between them and holds the end
 * colours beyond them, so a 950 hPa cyclone is as blue as the first stop and a
 * 1045 hPa Siberian high as tan as the last.
 */
const STOPS_HPA: readonly [number, [number, number, number]][] = [
  [970, [74, 134, 209]], // deep low
  [990, [94, 194, 214]],
  [1005, [155, 230, 196]],
  [1013, [198, 251, 196]], // the normal band
  [1022, [238, 245, 194]],
  [1032, [243, 223, 166]], // strong high
];

/**
 * The palette in the texture's own unit: a source stored in Pa puts its stops
 * at 97000 and up, so the same pressure is the same colour on every model.
 */
export function isobarPalette(toHpa: number): [number, Rgba][] {
  return STOPS_HPA.map(([hpa, [r, g, b]]) => [hpa / toHpa, [r, g, b, ALPHA]]);
}
