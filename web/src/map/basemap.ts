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
 * The shadow is also the one optional part: `greyBasemap({ shoreShadow })`
 * leaves it and its source out entirely when an organisation has not switched
 * it on, because its tiles are rendered on the server rather than shipped.
 *
 * It sits *above* the anchor because the ground it belongs to is not
 * always visible. A global field — IFS covers the whole world — paints over
 * every pixel of the ground, and with land and sea the same grey, a shadow
 * underneath it would be a land/sea cue that exists only while the data is
 * regional. It is still below the boundaries: the shadow shades water, the
 * lines say where a border is, and only the second is a claim. See
 * `SHADOW_OPACITY` for what drawing it over a palette costs.
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { ICON_PREFIX } from "./weatherIcons";

/** The layer the viewer's own layers insert before. Core's name, core's role. */
export const DATA_ANCHOR_ID = "georiva-data-anchor";

/**
 * The cities and towns, with their values: a GeoJSON source the viewer fills
 * (`map/places.ts`) from this style's own `place` features. Declared empty, so
 * the style is whole before the first frame and the names appear as soon as
 * the viewer has read them.
 */
export const PLACES_SOURCE_ID = "places";

/**
 * The towns with their weather symbols (`map/symbols.ts`), filled by
 * `MapView.vue` from a Forti model's town forecasts. Declared empty, like the
 * places, so the layer exists from the first frame and only its data changes.
 */
export const WEATHER_SYMBOLS_SOURCE_ID = "weather-symbols";
export const WEATHER_SYMBOLS_LAYER_ID = "weather-symbols";

/**
 * NRK's icons are CC BY 4.0, so the credit is on the map whenever they are.
 * On the source rather than in a fixed control: MapLibre credits only the
 * sources a visible layer reads, and the symbols layer is visible only in
 * Weather (`MapView.vue`).
 */
const WEATHER_SYMBOLS_CREDIT =
  'Weather symbols © <a href="https://nrkno.github.io/yr-weather-symbols/" target="_blank" rel="noopener">Yr/NRK</a>, ' +
  '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>';

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
 * muddies against a mid-tone and fails exactly where it is needed, and 0.8 px.
 * That is down from 1.2, which read heavy once every city and town carried a
 * value under its name and the map held twice the outlined text; 0.8 was
 * compared against 1.0 and 1.2 over temperature and over near-white dry
 * precipitation, and it still closes around the smallest town labels.
 *
 * The black ring is also what keeps a name off the wind: the particles are
 * white too (`WIND.color` in `MapView.vue`), and without an outline a trail
 * running through a label would read as part of the letters.
 */
const TEXT = "#ffffff";
const HALO = "#000000";
const HALO_WIDTH = 0.8;

/** The basemaps a user can pick: the same features, two palettes. */
export type BasemapName = "grey" | "light";

/**
 * What a basemap is: colours, and the two things colour alone cannot say.
 * Light fills the ocean — on grey the sea is the bare ground, told apart by the
 * shore's shadow — and hides the shadow, which on pale water reads as a stain.
 */
interface Palette {
  ground: string;
  water: string;
  waterFilter: FilterSpecification;
  line: string;
  /** Coastline, country, disputed and state borders. */
  lineOpacity: [number, number, number, number];
  text: string;
  /** `undefined` is the style's default — 1 — so a switch back restores it exactly. */
  textOpacity: number | undefined;
  halo: string;
  haloWidth: number;
  warm: string;
  cold: string;
  shadow: boolean;
}

/** OpenMapTiles' lakes, above ground: the grey's only filled water. */
const LAKES: FilterSpecification = ["all", ["==", ["get", "class"], "lake"], ["!=", ["get", "brunnel"], "tunnel"]];
/** Every water polygon above ground, ocean included: core's light water. */
const ALL_WATER: FilterSpecification = [
  "all",
  ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
  ["!=", ["get", "brunnel"], "tunnel"],
];

const GREY: Palette = {
  ground: GROUND,
  water: INLAND_WATER,
  waterFilter: LAKES,
  line: LINE,
  lineOpacity: [0.9, 0.9, 0.7, 0.45],
  text: TEXT,
  textOpacity: undefined,
  halo: HALO,
  haloWidth: HALO_WIDTH,
  // Yr's red and blue, lightened to read on the dark ground.
  warm: "#ff8a80",
  cold: "#82b1ff",
  shadow: true,
};

/**
 * Core's light variant (`config/static/basemap/georiva-basemap.json`'s
 * `light-*` layers), its colours and nothing more. Kept in step by hand; the
 * features stay this style's own.
 */
const LIGHT: Palette = {
  ground: "rgb(242,243,240)",
  water: "rgb(194,200,202)",
  waterFilter: ALL_WATER,
  line: "hsl(0,0%,20%)",
  lineOpacity: [0.55, 0.6, 0.5, 0.45],
  text: "hsl(0,0%,0%)",
  textOpacity: 0.7,
  halo: "#ffffff",
  haloWidth: 1.25,
  // Yr's own, on its own pale ground.
  warm: "#c60000",
  cold: "#0062bf",
  shadow: false,
};

const PALETTES: Record<BasemapName, Palette> = { grey: GREY, light: LIGHT };

/** For the control: each basemap's name and its ground, as a swatch. */
export const BASEMAPS: { name: BasemapName; label: string; swatch: string }[] = [
  { name: "grey", label: "Grey", swatch: GREY.ground },
  { name: "light", label: "Light", swatch: LIGHT.ground },
];


const REGULAR = ["Noto Sans Regular"];
const ITALIC = ["Noto Sans Italic"];

/** The English name where there is one, the local name otherwise. */
const NAME: ExpressionSpecification = ["to-string", ["coalesce", ["get", "name_en"], ["get", "name"]]];

/**
 * A city or town's name, with the forecast under it when there is one.
 *
 * The value arrives already formatted (`places.ts`), so this only stacks it:
 * the same font, size, colour and halo as the name, because a second line is
 * all it needs to read as the place's value. A place with nothing under it has
 * no `value` property and keeps its name alone.
 */
const NAME_AND_VALUE: ExpressionSpecification = [
  "case",
  ["has", "value"],
  ["concat", NAME, "\n", ["get", "value"]],
  NAME,
];

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

/**
 * A town's label in the Weather layer: its name, then the temperature in the
 * palette's warm or cold colour, then the wind. Layout, not paint — the colour
 * lives inside the text — so a switch of basemap sets it again.
 */
function weatherText(palette: Palette): ExpressionSpecification {
  return [
    "format",
    ["get", "name"],
    {},
    "\n",
    {},
    ["coalesce", ["get", "temperature"], ""],
    { "text-color": ["case", ["has", "cold"], palette.cold, palette.warm] },
    " ",
    {},
    ["coalesce", ["get", "wind"], ""],
    { "font-scale": 0.9 },
  ] as ExpressionSpecification;
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
    // The grey's lakes only; light widens it to every water polygon (`LIGHT`).
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
 *
 * Which name appears at which zoom is core's, ported from
 * `config/static/basemap/georiva-basemap.json`: three rank tiers for countries
 * and three for cities, each with its own window, rather than the two-tier
 * split this had. A rank is OpenMapTiles' own judgement of a place's
 * importance, and splitting on it is what lets a small country appear at all
 * without the large ones shouting at the same size.
 *
 * `country-md` is the tier that makes a world view possible: exactly rank 2,
 * drawn as the ISO code below z2 and as the name from z2. Core's trick, and
 * the only way that tier fits across an ocean's width of screen.
 *
 * What did *not* come across from core is as deliberate as what did. Its type
 * scale is nearly twice this one (country names to 24 px, ocean names to 30),
 * which is a size for an inspection map rather than for names over a forecast.
 * Its city dots are sprite icons and this style declares no sprite. Its
 * states, villages, bays and river labels are a street map's worth of detail
 * over the data. And its cities start at z1, where this style keeps them off:
 * at a hemisphere of forecast a scatter of city names is clutter, and they
 * arrive at z5, where a user has zoomed to a country and wants to find a place
 * in it.
 *
 * Cities and towns are read from `PLACES_SOURCE_ID` rather than from the tiles,
 * because they carry the selected quantity's value on a second line and a
 * label can only show what its own feature carries. The features are still
 * OpenMapTiles' — `map/places.ts` copies them with their name, class and rank —
 * so the filters, zoom windows and rank order below are unchanged. Countries
 * and islands name areas rather than points, carry no value, and stay on the
 * tiles.
 *
 * Their type is a pixel larger than it was before they carried values, at every
 * stop: a name and a number are read rather than glanced at, and the thinner
 * halo (`HALO_WIDTH`) left them looking small. Measured at z6–z7 over East
 * Africa, the larger boxes cost one or two of the lowest-ranked names in forty
 * to eighty to collisions.
 */
const placeLabels: LayerSpecification[] = [
  {
    id: "country-lg",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 1,
    maxzoom: 7,
    filter: places(["country"], [null, 1]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.14,
      // Narrower at the world view, where a wrapped name has nowhere to go.
      "text-max-width": byZoom([
        [0, 5],
        [3, 6],
      ]),
      "text-size": byZoom([
        [1, 8.5],
        [6, 14],
      ]),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    id: "country-md",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 1,
    maxzoom: 8,
    filter: places(["country"], [2, 2]),
    layout: {
      "text-font": REGULAR,
      // The ISO code until there is room for the name. Uppercase and spaced
      // like its neighbours, so a code reads as a label rather than a stub.
      "text-field": ["step", ["zoom"], ["to-string", ["get", "iso_a2"]], 2, NAME] as ExpressionSpecification,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.13,
      "text-max-width": 6,
      "text-size": byZoom([
        [3, 8.5],
        [8, 13],
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
    minzoom: 1,
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
          [5, 8.5],
          [9, 12.5],
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
    source: PLACES_SOURCE_ID,
    minzoom: 5,
    maxzoom: 14,
    filter: places(["city"], [null, 2]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME_AND_VALUE,
      "text-max-width": 7,
      "text-size": byZoom(
        [
          [5, 11],
          [12, 17],
        ],
        0.9,
      ),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    id: "city-md",
    type: "symbol",
    source: PLACES_SOURCE_ID,
    minzoom: 5,
    maxzoom: 14,
    filter: places(["city"], [3, 4]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME_AND_VALUE,
      "text-max-width": 7,
      "text-size": byZoom(
        [
          [5, 10.5],
          [12, 16],
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
    source: PLACES_SOURCE_ID,
    minzoom: 6,
    maxzoom: 14,
    filter: places(["city"], [5, null]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME_AND_VALUE,
      "text-max-width": 7,
      "text-size": byZoom(
        [
          [7, 10.5],
          [12, 15.5],
        ],
        0.9,
      ),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    // Towns arrive where a country fills the screen and a city name is no
    // longer enough to say where you are.
    id: "town",
    type: "symbol",
    source: PLACES_SOURCE_ID,
    minzoom: 7,
    maxzoom: 15,
    filter: places(["town"], [null, null]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME_AND_VALUE,
      "text-max-width": 7,
      "text-size": byZoom([
        [7, 10],
        [15, 14.5],
      ]),
      ...BY_RANK,
    },
    paint: textPaint,
  },
  {
    // An island's name is often the only thing on screen that is not water,
    // which is worth more here than it is on a street map.
    id: "island",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 6,
    maxzoom: 16,
    filter: places(["island"], [null, null]),
    layout: {
      "text-font": REGULAR,
      "text-field": NAME,
      "text-max-width": 7,
      "text-size": byZoom([
        [10, 9],
        [18, 13],
      ]),
      ...BY_RANK,
    },
    paint: textPaint,
  },
];

/**
 * Water names, italic by the old marine convention and spaced by how much room
 * the body has. They do real work here: with the sea the same grey as the
 * land, a name is one of the few cues left that you are looking at water.
 *
 * Italic means water, not "ocean or sea" — a distinction no reader would
 * derive — so the lakes core labels come across on the same terms, at 0.05
 * spacing because a lake name sits in a far smaller shape than an ocean's.
 * Bays still stay out: they crowd the coast, which is where the data needs the
 * room, and that was true before core's tiers arrived.
 *
 * Each tier arrives twice because OpenMapTiles gives the large bodies a line to
 * curve the text along as well as a point to sit on.
 */
const ON_POINTS: ExpressionSpecification = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
const ON_LINES: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

const waterLabels: LayerSpecification[] = (
  [
    ["ocean", ["ocean"], 0.25, [1, 5] as [number, number], [[1, 11], [4, 20]] as Stop[]],
    ["sea", ["sea"], 0.15, [2, 8] as [number, number], [[2, 10], [5, 15]] as Stop[]],
    ["lake", ["lake"], 0.05, [5, 16] as [number, number], [[5, 9], [10, 11.5], [16, 14]] as Stop[]],
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

/**
 * A town's weather, read like Yr's map: the symbol over the name, then the
 * temperature and the wind with an arrow.
 *
 * One symbol per town, icon and text together, so MapLibre's collision hides
 * a town whole and the gazetteer's rank decides who wins (`sort`, from
 * `map/symbols.ts`). The icons are not in a sprite: `map/weatherIcons.ts`
 * supplies each one on `styleimagemissing`. A town with no symbol code keeps
 * its text — `icon-image` resolves to nothing, which MapLibre draws as no icon.
 */
const weatherSymbols: LayerSpecification = {
  id: WEATHER_SYMBOLS_LAYER_ID,
  type: "symbol",
  source: WEATHER_SYMBOLS_SOURCE_ID,
  layout: {
    // Shown by the map only in the Weather layer, which also brings its credit.
    visibility: "none",
    "icon-image": ["case", ["has", "symbol"], ["concat", ICON_PREFIX, ["get", "symbol"]], ""],
    "icon-anchor": "bottom",
    "text-anchor": "top",
    "text-font": REGULAR,
    "text-size": byZoom([
      [4, 11],
      [10, 14],
    ]),
    "text-max-width": 10,
    "text-field": weatherText(GREY),
    "symbol-sort-key": ["get", "sort"],
  },
  paint: textPaint,
};

// ---------------------------------------------------------------------------
// Two basemaps, one style
// ---------------------------------------------------------------------------

/** One change to the style, the same whether made to the spec or to a live map. */
export type Restyle =
  | { layer: string; paint: string; value: unknown }
  | { layer: string; layout: string; value: unknown }
  | { layer: string; filter: FilterSpecification };

const LINE_LAYERS = ["coastline", "boundary-country", "boundary-disputed", "boundary-state"];

/**
 * Everything that differs between basemaps, as changes to make. The style is
 * built by applying them to the grey spec, and a switch applies them to the
 * live map (`MapView.vue`), so the two can never disagree — and no `setStyle`
 * ever takes down deck's layers or the names' data.
 */
export function restyle(name: BasemapName): Restyle[] {
  const p = PALETTES[name];
  const names = [...placeLabels, ...waterLabels, weatherSymbols].map((layer) => layer.id);
  return [
    { layer: "ground", paint: "background-color", value: p.ground },
    { layer: "lake", paint: "fill-color", value: p.water },
    { layer: "lake", filter: p.waterFilter },
    { layer: "waterway", paint: "line-color", value: p.water },
    ...LINE_LAYERS.flatMap((layer, i) => [
      { layer, paint: "line-color", value: p.line },
      { layer, paint: "line-opacity", value: p.lineOpacity[i] },
    ]),
    ...names.flatMap((layer) => [
      { layer, paint: "text-color", value: p.text },
      { layer, paint: "text-opacity", value: p.textOpacity },
      { layer, paint: "text-halo-color", value: p.halo },
      { layer, paint: "text-halo-width", value: p.haloWidth },
    ]),
    { layer: WEATHER_SYMBOLS_LAYER_ID, layout: "text-field", value: weatherText(p) },
    { layer: "shore-shadow", layout: "visibility", value: p.shadow ? undefined : "none" },
  ];
}

/** Apply `changes` to a style spec in place, skipping layers it does not have (the shadow may be absent). */
export function applyRestyle(style: StyleSpecification, changes: Restyle[]): StyleSpecification {
  for (const change of changes) {
    const layer = style.layers.find((l) => l.id === change.layer) as unknown as
      | Record<string, Record<string, unknown> | FilterSpecification | undefined>
      | undefined;
    if (!layer) continue;
    if ("filter" in change) {
      layer.filter = change.filter;
      continue;
    }
    const [group, property] = "paint" in change ? ["paint", change.paint] : ["layout", change.layout];
    const properties = (layer[group] ?? {}) as Record<string, unknown>;
    if (change.value === undefined) delete properties[property];
    else properties[property] = change.value;
    if (Object.keys(properties).length === 0) delete layer[group];
    else layer[group] = properties;
  }
  return style;
}

/**
 * The style, with or without the shadow.
 *
 * A function rather than a constant because the shadow is the one part of
 * this map that may genuinely be absent: its tiles are rendered on the server
 * that serves them, not shipped with the bundle, and an organisation switches
 * it on once that has been done (`docs/shore-shadow.md`). The catalogue tells
 * us both facts as one `shore_shadow` flag.
 *
 * When it is off, the layer *and its source* are left out rather than hidden.
 * A hidden layer still has a source, and a source with no pyramid behind it is
 * several hundred 404s on every pan — so "off" has to mean the style does not
 * know the tiles exist.
 */
export function viewerBasemap({
  shoreShadow = false,
  basemap = "grey",
}: { shoreShadow?: boolean; basemap?: BasemapName } = {}): StyleSpecification {
  // A copy: the layers are this module's constants, and a restyle changes them in place.
  return applyRestyle(structuredClone(greySpec(shoreShadow)), restyle(basemap));
}

function greySpec(shoreShadow: boolean): StyleSpecification {
  return {
    version: 8,
    name: "GeoRiva forecast viewer basemap",
    sources: {
      openmaptiles: { type: "vector", url: `${OPENFREEMAP}/planet` },
      [PLACES_SOURCE_ID]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      [WEATHER_SYMBOLS_SOURCE_ID]: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        attribution: WEATHER_SYMBOLS_CREDIT,
      },
      ...(shoreShadow
        ? {
            "shore-shadow": {
              type: "raster" as const,
              tiles: [SHADOW_TILES],
              tileSize: 512,
              maxzoom: SHADOW_MAX_ZOOM,
            },
          }
        : {}),
    },
    glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
    layers: [
      ...ground,
      anchor,
      ...(shoreShadow ? shadow : []),
      ...boundaries,
      ...placeLabels,
      ...waterLabels,
      weatherSymbols,
    ],
  };
}
