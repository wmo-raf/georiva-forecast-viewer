/**
 * Place names with the forecast under them: each city and town on screen,
 * carrying the selected quantity's value at its own point.
 *
 * MapLibre cannot put a value into a basemap label. A label's text is a layout
 * property, and layout reads only the feature's own properties — not
 * `feature-state`, and certainly not a deck.gl texture. So the cities and
 * towns are drawn from a GeoJSON source of the viewer's own (`basemap.ts`),
 * which this module fills: the basemap's own `place` features, with the value
 * read off the texture already on screen (`sample.ts`) written onto each one.
 *
 * Which places, and when each appears, stays the basemap's business. The
 * features are OpenMapTiles' — the same OSM nodes, classes and ranks the
 * basemap labelled before — and the label layers keep their filters and zoom
 * windows unchanged. Only where they read the features from has moved.
 *
 * A place with no value under it keeps its name and loses the number: outside
 * a regional domain, on a nodata or clipped pixel, or before the frame has
 * arrived. A missing number is honest; a missing name costs the user their
 * bearings.
 */

import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

/** The place classes that carry a value. Countries and islands name areas, not points. */
export const VALUED_CLASSES = ["city", "town"];

/** What a place feature has to carry for its label: the basemap's name, class and rank. */
const CARRIED = ["name", "name_en", "class", "rank"] as const;

/** The shape `querySourceFeatures` hands back, as far as this module reads it. */
export interface SourcePlace {
  id?: string | number;
  geometry: Geometry;
  properties: Record<string, unknown> | null;
}

/**
 * A value as a label shows it: rounded to the quantity's decimals, and never
 * "-0" — a value that rounds to nothing is nothing, not a negative nothing.
 */
export function formatValue(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

/**
 * One key per place, however many tiles it turned up in.
 *
 * A place near a tile's edge sits in its neighbour's buffer too, and while
 * tiles load a parent tile can hold it as well, so `querySourceFeatures`
 * returns it more than once. The feature id is OpenMapTiles' OSM id where the
 * tiles carry one; without it, the class and name at about a kilometre's
 * rounding, which survives the few metres a coordinate moves between zooms.
 */
function keyOf(place: SourcePlace, [lon, lat]: number[]): string {
  if (place.id !== undefined) return `id:${place.id}`;
  const props = place.properties ?? {};
  return `${props.class}|${props.name}|${lon.toFixed(2)}|${lat.toFixed(2)}`;
}

/**
 * The places to label, each with its value when there is one.
 *
 * `valueAt` answers `null` where there is nothing to say — off the texture,
 * on nodata, or when no texture belongs to the selected quantity — and the
 * place is kept with no `value` property, which the label layer reads as
 * "name only".
 */
export function placesWithValues(
  places: SourcePlace[],
  valueAt: (lon: number, lat: number) => number | null,
  decimals: number,
): FeatureCollection<Point> {
  const seen = new Set<string>();
  const features: Feature<Point>[] = [];
  for (const place of places) {
    if (place.geometry.type !== "Point") continue;
    const props = place.properties ?? {};
    if (!VALUED_CLASSES.includes(String(props.class))) continue;
    const coordinates = place.geometry.coordinates;
    const key = keyOf(place, coordinates);
    if (seen.has(key)) continue;
    seen.add(key);

    const properties: Record<string, unknown> = {};
    for (const name of CARRIED) {
      if (props[name] !== undefined) properties[name] = props[name];
    }
    const value = valueAt(coordinates[0], coordinates[1]);
    if (value !== null) properties.value = formatValue(value, decimals);
    features.push({ type: "Feature", geometry: { type: "Point", coordinates }, properties });
  }
  return { type: "FeatureCollection", features };
}
