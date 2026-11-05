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
 * The shore's shadow is ours too, all the way down: `SHADOW_TILES` are rendered
 * from Natural Earth by `tools/build_shore_shadow.py`, committed under
 * `web/public/shore-shadow/` and served from this bundle's own static path. No
 * address in this style belongs to anybody but us and OpenFreeMap.
 *
 * Layer order is what keeps the data in the middle of the picture: the ground,
 * then an empty `georiva-data-anchor`, then the shore's shadow, then the
 * boundaries, then the labels. `MapView.vue` inserts its deck layers before the
 * anchor, so data draws above the ground and below the shadow, the borders and
 * the names. `basemap.test.ts` holds that order, and the references below, to
 * the invariants they are.
 *
 * The shadow sits *above* the anchor because the ground it belongs to is not
 * always visible. A global field — IFS covers the whole world — paints over
 * every pixel of the ground, and with land and sea the same grey, a shadow
 * underneath it would be a land/sea cue that exists only while the data is
 * regional. It is still below the boundaries: the shadow shades water, the
 * lines say where a border is, and only the second is a claim. See
 * `SHADOW_OPACITY` for what drawing it over a palette costs.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/** The layer the viewer's own layers insert before. Core's name, core's role. */
export const DATA_ANCHOR_ID = "georiva-data-anchor";

const OPENFREEMAP = "https://tiles.openfreemap.org";

/**
 * The greys, dead neutral (R=G=B). A cast of any kind would tint the data
 * sitting on top of it, and the point of this ground is that it does not.
 */
/** Land and ocean alike. One tone: the sea has no fill, and the shore is a line. */
const GROUND = "#8c8c8c";
/**
 * Lakes, and the larger rivers. A step darker than the ground, and a step
 * lighter than `LINE`: a coastline is a hard boundary you read the map by, a
 * lake or a river is a landscape feature, and they should not speak at the
 * same volume.
 */
const INLAND_WATER = "#7a7a7a";
/** The shore and the borders: darker than the ground, which is what makes them read. */
const LINE = "#6b6b6b";
/**
 * The shore's shadow, as pre-rendered raster tiles: black at nine alpha steps
 * over transparency, a crisp shore and a graduated band falling away from it
 * into the water.
 *
 * It is drawn this way because MapLibre cannot do it. The vector attempt was a
 * blurred line pushed off the shore with `line-offset`, and `line-offset`
 * turns the geometry inside out wherever it outruns the spacing between
 * vertices — which, on a shoreline as intricate as Lake Victoria's, is
 * everywhere. It tore the lake into black starbursts. A raster has no geometry
 * to fold.
 *
 * These tiles are our own. They are rendered offline from Natural Earth's
 * 1:10m land and lakes — public domain — by `tools/build_shore_shadow.py`,
 * which reads a ramp off each water pixel's distance to land and multiplies it
 * by the water mask, so the band is one-sided by construction, exactly zero on
 * land, and never saturates on a narrow lake. How far it reaches is a function
 * of zoom, measured off the pyramid this replaced: a 4-pixel hairline at the
 * world view, 20 px at z6, 25 from z7. A single width at every zoom — which
 * this had at first — darkens 2,200 km of ocean at z0 and smothers the map.
 * They are committed
 * under `web/public/shore-shadow/` and copied into the bundle by the build, so
 * the address below is this bundle's own base path: the tiles arrive from
 * whatever host served the app, over the same connection, with no third party
 * in the picture.
 *
 * Two things that followed from rendering them ourselves rather than borrowing
 * a stranger's pyramid, which is what this replaced
 * (wmo-raf/georiva-forecast-viewer#15):
 *
 * - **They contain a shadow and nothing else.** The borrowed tiles carried
 *   somebody's unaudited rendering of international boundaries underneath
 *   ours — an inland tile over DRC with no coast in it was still 18,718
 *   non-transparent pixels. Ours draw only the water beside a shore, so the
 *   only boundaries on this map are the ones whose filters live in this
 *   repository.
 * - **Nothing bills a stranger's egress**, and there is no host outside this
 *   deployment that can take the map's legibility away by deleting a bucket.
 */
const SHADOW_TILES = `${import.meta.env.BASE_URL}shore-shadow/{z}/{x}/{y}.png`;
/**
 * The pyramid stops at z8, as the borrowed one did, and the layer fades out
 * above it rather than letting MapLibre overzoom an upscaled blur.
 *
 * z8 is where Natural Earth 1:10m starts to cost something: it is accurate to
 * a few hundred metres, about a pixel at z6 and three or four by z8, so at the
 * bottom of the pyramid the band's hard landward edge can sit a few pixels off
 * the coastline drawn over it from OpenMapTiles. That is the price of the
 * shadow surviving to the zoom a forecast is actually read at; past z8 it is
 * no longer worth paying. `MAX_ZOOM` in `shore_shadow.py` is the other half of
 * this number.
 */
const SHADOW_MAX_ZOOM = 8;
/**
 * How much of the shadow is drawn, now that it is drawn over the data.
 *
 * The band's steps were cut for bare grey, where the pixel at the shore is 68%
 * black (`shore_shadow.py`'s `(173, 130, …)`). Over a palette that same pixel
 * knocks the forecast down to a third of its colour, in a rim hugging exactly
 * the coast a landfall is read at — a dark edge that is not on the legend and
 * reads as a value. At 0.6 the peak is about 40%: the shore still states
 * itself, and the colours underneath stay recognisably their own.
 *
 * One number serves both cases, because the style is a static object and
 * nothing here knows whether a texture is loaded. The bare-ground shadow —
 * before the first frame, outside a regional domain, an org with nothing
 * configured — is softer than it was by the same amount, which is a price
 * worth paying to keep `MapView.vue` out of the business of painting the
 * basemap.
 */
const SHADOW_OPACITY = 0.6;

/**
 * White names in a hard black outline, everywhere: countries, cities, oceans
 * and seas alike, from the one `textPaint` below.
 *
 * A single text colour has to survive both ends of every palette and the grey
 * between them, and only an outlined one does. Dark grey with a faint white
 * halo — which is what this was — is tuned to the ground, and the ground is
 * the thing a global field paints over: IFS leaves no grey anywhere, so the
 * names spend their whole life over colour. White on black is the pair that
 * does not care which colour.
 *
 * So the halo carries the label and the fill is the constant, which is the
 * reverse of what it used to be. It is opaque, because a see-through outline
 * muddies against a mid-tone and fails exactly where it is needed, and 1.2 px,
 * which closes cleanly around text from 10 to 19 px — MapLibre builds halos
 * from the glyph SDF and they stop growing well past about a quarter of the
 * font size.
 *
 * The black ring is also what keeps a name off the wind: the particles are
 * white too (`WIND.color` in `MapView.vue`), and without an outline a trail
 * running through a label would read as part of the letters.
 */
const TEXT = "#ffffff";
const HALO = "#000000";
const HALO_WIDTH = 1.2;

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
 * The ground: one grey, and the larger rivers once there is room for them.
 * Tunnelled water is dropped: a culvert drawn as a river is just a wrong line.
 *
 * The ocean has no fill — the sea is the background, and the shore is a line.
 * Lakes do, because a flat fill is the one way of saying "water" that cannot
 * fold, spike or stack however intricate the shoreline, and Lake Victoria's is
 * about as intricate as they come.
 *
 * The lake fill stays here, under the anchor, where a field covers it. A
 * forecast has a value over Lake Victoria and the viewer should draw it rather
 * than punch a grey disc through it; the lake keeps its shape through the
 * shadow's ring above, which is the whole reason that ring is rendered from
 * Natural Earth's lakes as well as its land.
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
 * The shore's shadow, as a raster (see `SHADOW_TILES`), and the first thing
 * drawn above the anchor.
 *
 * It is a shadow and only a shadow: no line, no border, nothing asserted —
 * which is why it goes under the boundaries rather than over them. The
 * coastline above it is still drawn from OpenMapTiles, because the shadow says
 * "this is water" and the coastline says "this is where the boundary is", and
 * only the second of those is a claim.
 *
 * Over the data, then, and over the wind's particles with it: both deck layers
 * carry the same `beforeId`, so `deck.gl/maplibre` draws them in one group at
 * one insertion point and nothing can be slipped between them. Trails in the
 * coastal band are dimmed by the shadow rather than hidden by it — see
 * `SHADOW_OPACITY`, which is what makes that bearable.
 */
const shadow: LayerSpecification[] = [
  {
    // Faded out above the pyramid's last level rather than overzoomed: an
    // upscaled shore under our own crisp one would read as a smudge.
    id: "shore-shadow",
    type: "raster",
    source: "shore-shadow",
    paint: {
      "raster-opacity": byZoom([
        [SHADOW_MAX_ZOOM, SHADOW_OPACITY],
        [SHADOW_MAX_ZOOM + 2, 0],
      ]),
      "raster-fade-duration": 0,
    },
  },
];

/**
 * The shore and the borders, ported from core's `boundary_layers()` — the
 * filters are correctness rather than taste and should not diverge between the
 * two styles. OpenMapTiles has no coastline layer: the shore is where a water
 * polygon ends, so it is drawn as the outline of the ocean and lake polygons,
 * which with no ocean fill is the only thing distinguishing sea from land.
 * Maritime border lines stay out; disputed ones are dashed and `claimed_by`
 * variants are dropped. That treatment is a WMO product's obligation and is not
 * up for restyling.
 *
 * These are the lines the product *asserts*, which is what separates them from
 * the shadow below them: the shadow shades water, these say where a boundary
 * is. It is why the shadow is rendered from land and lakes only, and why no
 * raster on this map is allowed to carry a border of its own.
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
 * Countries carry the map: uppercase, letter-spaced, regular weight. Quiet is
 * now the business of the letterforms rather than the colour — see `TEXT`.
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
    "shore-shadow": {
      type: "raster",
      tiles: [SHADOW_TILES],
      tileSize: 512,
      maxzoom: SHADOW_MAX_ZOOM,
    },
  },
  glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
  layers: [...ground, anchor, ...shadow, ...boundaries, ...placeLabels, ...marineLabels],
};
