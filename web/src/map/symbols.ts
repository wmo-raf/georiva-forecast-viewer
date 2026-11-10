/**
 * Weather symbols over the towns: each town's Yr symbol, temperature and wind
 * for the step on screen, from a Forti model's town forecasts
 * (`/api/forecast/{model}/places/`, fetched once per run and sliced here).
 *
 * The label reads like Yr's map: the icon over the name, then the temperature
 * and the wind speed with an arrow. The arrow is a glyph (←↑→↓↖↗↘↙) rather
 * than a rotated icon, so the icon and every line of text are *one* MapLibre
 * symbol and hide together in a collision — a town never loses its name but
 * keeps its icon. Eight directions is what Yr itself shows.
 *
 * They are the Weather layer's whole map (`state/weather.ts`): no raster, wind
 * or pressure under them, and their own timeline — the run and the times Forti
 * answered for — so a symbol never sits over a field from another forecast.
 */

import type { Feature, FeatureCollection, Point } from "geojson";
import type { PlacesMatrix } from "../api/types";

/** Where the wind blows *to*, clockwise from north, in eighths. */
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/**
 * The arrow for a wind coming *from* `degrees`. An arrow shows where the air
 * goes, as Yr's does: an easterly — from 90° — points west.
 */
export function windArrow(fromDegrees: number): string {
  const to = (((fromDegrees + 180) % 360) + 360) % 360;
  return ARROWS[Math.round(to / 45) % 8];
}

/** A whole degree, and never "-0°". */
export function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/**
 * The collision priority: lower wins. Rank first — a capital beats a bigger
 * market town — then population within a rank.
 */
export function sortKey(rank: number, population: number): number {
  return rank * 1e8 - Math.min(population, 1e8 - 1);
}

function columnOf(matrix: PlacesMatrix, time: string): number {
  const wanted = Date.parse(time);
  return matrix.times.findIndex((t) => Date.parse(t) === wanted);
}

/** The towns with something to say at `time`, as the symbol layer's source. */
export function symbolsAt(matrix: PlacesMatrix | null, time: string | null): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  const col = matrix && time ? columnOf(matrix, time) : -1;
  if (!matrix || col < 0) return { type: "FeatureCollection", features };

  const { values } = matrix;
  matrix.towns.forEach((town, row) => {
    const symbol = values.symbol_code[row]?.[col] ?? null;
    const temperature = values.air_temperature[row]?.[col] ?? null;
    const speed = values.wind_speed[row]?.[col] ?? null;
    const direction = values.wind_from_direction[row]?.[col] ?? null;
    if (symbol === null && temperature === null) return;

    const properties: Record<string, unknown> = {
      name: town.name,
      rank: town.rank,
      sort: sortKey(town.rank, town.population),
    };
    if (symbol !== null) properties.symbol = symbol;
    if (temperature !== null) {
      properties.temperature = formatTemperature(temperature);
      if (Math.round(temperature) < 0) properties.cold = true;
    }
    if (speed !== null) {
      properties.wind = direction !== null ? `${Math.round(speed)} m/s ${windArrow(direction)}` : `${Math.round(speed)} m/s`;
    }
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: town.coordinates }, properties });
  });
  return { type: "FeatureCollection", features };
}

/**
 * Degrees within which a basemap name is taken to be a drawn town's own: about
 * 15 km, wider than the gap between OpenStreetMap's node for a town and
 * GeoNames' point for it, narrower than the gap between neighbouring towns.
 */
export const SAME_PLACE_DEGREES = 0.15;

/**
 * Which of the basemap's own city and town names the symbols already carry:
 * those within `SAME_PLACE_DEGREES` of a drawn town. Only those give way, so a
 * country with no imported towns — or a town the gazetteer lacks — keeps its
 * basemap name.
 *
 * A grid of `radius`-sized cells, so each lookup reads nine cells rather than
 * every town: the basemap is refilled on every tile burst.
 */
export function spokenFor(
  collection: FeatureCollection<Point> | null,
  radius = SAME_PLACE_DEGREES,
): (lon: number, lat: number) => boolean {
  if (!collection?.features.length) return () => false;
  const cell = (v: number) => Math.floor(v / radius);
  const grid = new Map<string, [number, number][]>();
  for (const { geometry } of collection.features) {
    const [lon, lat] = geometry.coordinates;
    const key = `${cell(lon)}:${cell(lat)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push([lon, lat]);
    else grid.set(key, [[lon, lat]]);
  }
  const r2 = radius * radius;
  return (lon, lat) => {
    const [cx, cy] = [cell(lon), cell(lat)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const [x, y] of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if ((x - lon) ** 2 + (y - lat) ** 2 <= r2) return true;
        }
      }
    }
    return false;
  };
}
