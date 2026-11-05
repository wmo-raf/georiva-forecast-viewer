/**
 * The viewer's one basemap: a flat neutral grey ground under the data.
 *
 * Hand-authored rather than recoloured from a vendor style, because a forecast
 * map is mostly the *absence* of a street map. Nothing here draws roads,
 * buildings, landuse, aeroways, piers, glaciers or shaded relief, and nothing
 * here is coloured: the whole style is greyscale, so every colour on screen
 * belongs to the data. Compare core's `scripts/build_basemap_style.py`, which
 * keeps all of Positron and Dark faithfully because its map is an inspection
 * tool with a light/dark switch. This one has no switch.
 *
 * The defining choice is that **land and sea are the same grey**. There is no
 * ocean fill: the shore is a line, not a change of tone. A darker sea would
 * steal contrast from exactly the water the weather sits over, and would make
 * one half of every palette read differently offshore than onshore. Inland
 * lakes are the one body of water with a fill of its own, a step darker than
 * the ground rather than blue, so that nothing on the map can be mistaken for
 * a cold value or a rain cell.
 *
 * Only the style is ours. Tiles and glyphs stay on OpenFreeMap, and the
 * `openmaptiles` source is declared by its TileJSON URL so MapLibre reads the
 * OpenFreeMap / OpenMapTiles / OpenStreetMap attribution from it — there is no
 * credit line written down here to drift out of date. No sprite is declared
 * because nothing draws an icon.
 *
 * Layer order is what keeps the data in the middle of the picture: the ground,
 * then an empty `georiva-data-anchor`, then the boundaries, then the labels.
 * `MapView.vue` inserts its deck layers before the anchor, so data draws above
 * the ground and below both the borders and the names. `basemap.test.ts` holds
 * that order, and the references below, to the invariants they are.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/** The layer the viewer's own layers insert before. Core's name, core's role. */
export const DATA_ANCHOR_ID = "georiva-data-anchor";

const OPENFREEMAP = "https://tiles.openfreemap.org";

/**
 * The greys, dead neutral (R=G=B). A cast of any kind would tint the data
 * sitting on top of it, and the point of this ground is that it does not.
 */
/** Land and ocean both. One tone, everywhere. */
const GROUND = "#8c8c8c";
/** Lakes and the larger rivers: water, said in grey. */
const INLAND_WATER = "#7a7a7a";
/** The shore and the borders: darker than the ground, which is what makes them read. */
const LINE = "#6b6b6b";

/**
 * Labels are dark on a light ground and carry no visible halo — but they *do*
 * carry a white one at low alpha. On the grey it cannot be seen; it asserts
 * itself only where a name crosses the dark end of a palette, which is the one
 * place dark text on its own would disappear.
 */
const TEXT = "#3a3a3a";
const HALO = "rgba(255,255,255,0.3)";
const HALO_WIDTH = 0.6;

const REGULAR = ["Noto Sans Regular"];
const ITALIC = ["Noto Sans Italic"];

/** The English name where there is one, the local name otherwise. */
const NAME: ExpressionSpecification = ["to-string", ["coalesce", ["get", "name_en"], ["get", "name"]]];

type Stop = [zoom: number, value: number];

/**
 * An interpolate-on-zoom expression from (zoom, value) pairs. `base` 1 is
 * linear, so one code path covers both kinds of ramp.
 */
function byZoom(stops: Stop[], base = 1): ExpressionSpecification {
  return ["interpolate", ["exponential", base], ["zoom"], ...stops.flat()] as ExpressionSpecification;
}

/** Places of these classes, optionally narrowed to a rank range (lower rank is more important). */
function places(classes: string[], [low, high]: [number | null, number | null]): ExpressionSpecification {
  const clauses: ExpressionSpecification[] = [["match", ["get", "class"], classes, true, false]];
  if (low !== null) clauses.push([">=", ["get", "rank"], low]);
  if (high !== null) clauses.push(["<=", ["get", "rank"], high]);
  return ["all", ...clauses] as ExpressionSpecification;
}

/** Ranks sort the labels against each other, so the important name wins a collision. */
const BY_RANK = { "symbol-sort-key": ["get", "rank"] as ExpressionSpecification };

const textPaint = {
  "text-color": TEXT,
  "text-halo-color": HALO,
  "text-halo-width": HALO_WIDTH,
};

/**
 * The ground: one grey, the inland water a step darker over it, and the larger
 * rivers once there is room for them. `ocean` is deliberately absent from the
 * water filter — the sea is the background. Tunnelled water is dropped too: a
 * culvert drawn as a river is just a wrong line.
 */
const ground: LayerSpecification[] = [
  {
    id: "ground",
    type: "background",
    paint: { "background-color": GROUND },
  },
  {
    id: "lake",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "water",
    filter: ["all", ["==", ["get", "class"], "lake"], ["!=", ["get", "brunnel"], "tunnel"]],
    paint: { "fill-color": INLAND_WATER, "fill-antialias": true },
  },
  {
    id: "waterway",
    type: "line",
    source: "openmaptiles",
    "source-layer": "waterway",
    minzoom: 5,
    filter: ["all", ["match", ["get", "class"], ["river", "canal"], true, false], ["!=", ["get", "brunnel"], "tunnel"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": INLAND_WATER,
      "line-width": byZoom([
        [5, 0.5],
        [10, 1.4],
        [14, 3],
      ]),
      "line-opacity": byZoom([
        [5, 0.5],
        [8, 1],
      ]),
    },
  },
];

/** Where the data goes: between the ground and everything meant to be read over it. */
const anchor: LayerSpecification = {
  id: DATA_ANCHOR_ID,
  type: "background",
  paint: { "background-opacity": 0 },
};

/**
 * The shore and the borders, ported from core's `boundary_layers()` — the
 * filters are correctness rather than taste and should not diverge between the
 * two styles. OpenMapTiles has no coastline layer: the shore is where a water
 * polygon ends, so it is drawn as the outline of the ocean and lake polygons,
 * which with no ocean fill is the only thing distinguishing sea from land.
 * Maritime border lines stay out; disputed ones are dashed and `claimed_by`
 * variants are dropped. That treatment is a WMO product's obligation and is not
 * up for restyling.
 */
const NOT_MARITIME: ExpressionSpecification = ["!=", ["get", "maritime"], 1];
const UNDISPUTED: ExpressionSpecification = ["!=", ["get", "disputed"], 1];
const COUNTRY: ExpressionSpecification = ["==", ["get", "admin_level"], 2];

const boundaries: LayerSpecification[] = [
  {
    id: "coastline",
    type: "line",
    source: "openmaptiles",
    "source-layer": "water",
    filter: ["match", ["get", "class"], ["ocean", "lake"], true, false],
    layout: { "line-join": "round" },
    paint: {
      "line-color": LINE,
      "line-width": byZoom([
        [0, 0.5],
        [6, 0.9],
        [12, 1.4],
      ]),
      "line-opacity": 0.9,
    },
  },
  {
    id: "boundary-country",
    type: "line",
    source: "openmaptiles",
    "source-layer": "boundary",
    filter: ["all", COUNTRY, NOT_MARITIME, UNDISPUTED, ["!", ["has", "claimed_by"]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": LINE,
      "line-width": byZoom([
        [1, 0.5],
        [5, 1],
        [12, 2],
      ]),
      "line-opacity": 0.9,
    },
  },
  {
    id: "boundary-disputed",
    type: "line",
    source: "openmaptiles",
    "source-layer": "boundary",
    filter: ["all", COUNTRY, NOT_MARITIME, ["==", ["get", "disputed"], 1]],
    paint: {
      "line-color": LINE,
      "line-width": byZoom([
        [1, 0.5],
        [5, 1],
        [12, 2],
      ]),
      "line-opacity": 0.7,
      "line-dasharray": [2, 2],
    },
  },
  {
    // From z5, not z3: at continental zoom a web of internal borders is clutter
    // over the data, and the reference map shows almost none there.
    id: "boundary-state",
    type: "line",
    source: "openmaptiles",
    "source-layer": "boundary",
    minzoom: 5,
    filter: ["all", ["==", ["get", "admin_level"], 4], NOT_MARITIME, UNDISPUTED],
    layout: { "line-join": "round" },
    paint: {
      "line-color": LINE,
      "line-width": byZoom([
        [5, 0.4],
        [9, 0.8],
        [12, 1.3],
      ]),
      "line-opacity": 0.45,
    },
  },
];

/**
 * Countries carry the map: uppercase, letter-spaced, regular weight, quiet.
 * Cities stay out of the continental view entirely and arrive at z5, where a
 * user has zoomed to a country and wants to find a place in it.
 */
const placeLabels: LayerSpecification[] = [
  {
    id: "country-lg",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 1,
    maxzoom: 8,
    filter: places(["country"], [null, 2]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.14,
      "text-max-width": 6,
      "text-size": byZoom([
        [1, 10],
        [6, 17],
      ]),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    id: "country-sm",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 2,
    maxzoom: 10,
    filter: places(["country"], [3, null]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.12,
      "text-max-width": 6,
      "text-size": byZoom(
        [
          [5, 10],
          [9, 15],
        ],
        0.9,
      ),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    id: "city-lg",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 5,
    maxzoom: 14,
    filter: places(["city"], [null, 2]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-max-width": 7,
      "text-size": byZoom(
        [
          [5, 12],
          [12, 19],
        ],
        0.9,
      ),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    id: "city-sm",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 7,
    maxzoom: 14,
    filter: places(["city"], [3, null]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-max-width": 7,
      "text-size": byZoom(
        [
          [7, 11],
          [12, 17],
        ],
        0.9,
      ),
      ...BY_RANK,
    },
    paint: textPaint,
  },
];

/**
 * Marine names, italic and widely spaced by the old convention. They do real
 * work here: with the sea the same grey as the land, a name is one of the few
 * cues left that you are looking at water. Oceans and seas only — bays crowd
 * the coast, which is where the data needs the room.
 *
 * Each tier arrives twice because OpenMapTiles gives the large bodies a line to
 * curve the text along as well as a point to sit on.
 */
const ON_POINTS: ExpressionSpecification = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
const ON_LINES: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

const marineLabels: LayerSpecification[] = (
  [
    ["ocean", ["ocean"], 0.25, [1, 5] as [number, number], [[1, 13], [4, 24]] as Stop[]],
    ["sea", ["sea"], 0.15, [2, 8] as [number, number], [[2, 12], [5, 18]] as Stop[]],
  ] as const
).flatMap(([name, classes, spacing, [minzoom, maxzoom], size]) =>
  (["pt", "ln"] as const).map((shape): LayerSpecification => {
    const placement =
      shape === "ln" ? { "symbol-placement": "line" as const, "text-pitch-alignment": "viewport" as const } : {};
    return {
      id: `water-${name}-${shape}`,
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      minzoom,
      maxzoom,
      filter: [
        "all",
        ["match", ["get", "class"], [...classes], true, false],
        shape === "pt" ? ON_POINTS : ON_LINES,
      ] as ExpressionSpecification,
      layout: {
        "text-font": ITALIC,
        "text-field": NAME,
        "text-letter-spacing": spacing,
        "text-max-width": 5,
        "text-size": byZoom(size),
        ...placement,
      },
      paint: textPaint,
    };
  }),
);

export const GREY_BASEMAP: StyleSpecification = {
  version: 8,
  name: "GeoRiva forecast viewer basemap",
  sources: {
    openmaptiles: { type: "vector", url: `${OPENFREEMAP}/planet` },
  },
  glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
  layers: [...ground, anchor, ...boundaries, ...placeLabels, ...marineLabels],
};
