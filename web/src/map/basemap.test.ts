import { describe, expect, it } from "vitest";
import { DATA_ANCHOR_ID, PLACES_SOURCE_ID, greyBasemap } from "./basemap";
import { VALUED_CLASSES } from "./places";

/**
 * The style with the shadow in it, which is what most of these are about: the
 * shadow's ordering and its source only exist in that shape. `without` is the
 * other one — an organisation that has not had the pyramid rendered — and it
 * has a describe of its own at the bottom.
 */
const GREY_BASEMAP = greyBasemap({ shoreShadow: true });
const without = greyBasemap();

/**
 * Two invariants, and deliberately not a third. Nothing here asserts a colour
 * or a zoom stop: those are tuned by eye against real data, and a test over
 * them would only ever report that someone changed them on purpose.
 *
 * What these cover is the pair of ways this style can break *silently* —
 * without an error anywhere, in a frame that still renders.
 */

const ids = GREY_BASEMAP.layers.map((layer) => layer.id);
const indexOf = (id: string) => ids.indexOf(id);
const layerOf = (id: string) => GREY_BASEMAP.layers.find((layer) => layer.id === id) as { filter?: unknown };
const paintOf = (id: string) => (layerOf(id) as unknown as { paint: Record<string, unknown> }).paint;

describe("the data anchor", () => {
  /**
   * `MapView.vue` hands `DATA_ANCHOR_ID` to deck as its `beforeId`. If the
   * anchor goes missing, MapLibre throws; if it merely *moves*, the data draws
   * over the borders and names, or under the lakes, and nothing complains.
   */
  it("sits between the ground and everything read over it", () => {
    const anchor = indexOf(DATA_ANCHOR_ID);
    expect(anchor).toBeGreaterThan(-1);

    const ground = ["ground", "lake", "waterway"];
    const over = ["shore-shadow", "coastline", "boundary-country", "boundary-disputed", "boundary-state"];
    const names = GREY_BASEMAP.layers.filter((layer) => layer.type === "symbol").map((layer) => layer.id);

    expect(names.length).toBeGreaterThan(0);
    for (const id of ground) expect(indexOf(id)).toBeLessThan(anchor);
    for (const id of [...over, ...names]) expect(indexOf(id)).toBeGreaterThan(anchor);
  });

  it("is invisible, so it changes nothing but the order", () => {
    const anchor = GREY_BASEMAP.layers.find((layer) => layer.id === DATA_ANCHOR_ID);
    expect(anchor).toMatchObject({ type: "background", paint: { "background-opacity": 0 } });
  });
});

describe("the shore shadow", () => {
  /**
   * It goes directly above the anchor: over the data, under the boundaries.
   *
   * Under the anchor — which is where it started — a global field paints it
   * out completely, and with land and sea the same grey that leaves nothing
   * saying which is which. IFS is global, so this is the ordinary case rather
   * than the edge one. Under the *boundaries*, because the shadow shades water
   * and the lines make a claim, and a claim is not something a raster gets to
   * sit on top of.
   *
   * Either mistake is silent: the layer renders, the map looks plausible, and
   * only a coastline with a forecast over it tells you. An earlier version put
   * it first in the ground, behind an opaque ocean fill, and drew nothing at
   * all — no error, no warning, just a shore with no shadow.
   */
  it("is the first thing drawn above the anchor", () => {
    const anchor = indexOf(DATA_ANCHOR_ID);
    expect(indexOf("shore-shadow")).toBe(anchor + 1);
    expect(indexOf("shore-shadow")).toBeLessThan(indexOf("coastline"));
  });

  /**
   * Drawn over a palette, so it is drawn at part strength. The band was cut
   * for bare grey, where the pixel at the shore is 68% black; left at 1 over
   * data that rim knocks the forecast down to a third of its colour, in a dark
   * edge along every coast that is not on the legend and reads as a value.
   */
  it("is drawn at part strength, because it is drawn over the data", () => {
    const opacity = paintOf("shore-shadow")["raster-opacity"] as unknown[];
    expect(opacity.at(-3)).toBe(0.6);
  });

  /** It is a raster, because the vector attempt folded the geometry and tore the lakes apart. */
  it("is a raster from its own source", () => {
    const layer = layerOf("shore-shadow") as unknown as { type: string; source: string };
    expect(layer.type).toBe("raster");
    expect(GREY_BASEMAP.sources[layer.source]).toMatchObject({ type: "raster", tileSize: 512 });
  });

  /**
   * The tiles are rendered by `tools/build_shore_shadow.py` and committed under
   * `web/public/shore-shadow/`, so they are served from the bundle's own base
   * path — and that is the whole of issue #15. A third-party absolute URL here
   * is how the map came to depend on an unlicensed bucket that also drew
   * somebody else's African borders under ours; the only hosts this bundle may
   * reach are its own origin and OpenFreeMap.
   */
  it("comes from our own host, by this bundle's base path", () => {
    const source = GREY_BASEMAP.sources["shore-shadow"] as { tiles?: string[] };
    const [url] = source.tiles ?? [];
    expect(url).toBe(`${import.meta.env.BASE_URL}shore-shadow/{z}/{x}/{y}.png`);
    expect(url).not.toMatch(/^https?:\/\//);
    expect(url).toContain("{z}/{x}/{y}");
  });

  /**
   * The pyramid ends at z8, as the borrowed one did. Without the fade MapLibre
   * overzooms it, and an upscaled band drifting off our own crisp coastline is
   * worse than none. `MAX_ZOOM` in `shore_shadow.py` is the other half of this
   * number: a style that claims a level the pyramid does not have asks every
   * client for tiles that are not there.
   */
  it("fades out above the pyramid rather than overzooming", () => {
    const source = GREY_BASEMAP.sources["shore-shadow"] as { maxzoom?: number };
    expect(source.maxzoom).toBe(8);
    const opacity = paintOf("shore-shadow")["raster-opacity"] as unknown[];
    expect(opacity.at(-1)).toBe(0);
  });

  /**
   * The shadow shades water; the boundaries say where a border is. Only the
   * second is a claim, and this product's claims are the ones whose filters
   * live in this repository — maritime lines out, disputed dashed, `claimed_by`
   * dropped. Deleting any of these layers because "the raster already shows
   * the coast" is the mistake this test exists to stop, and it is how the
   * borrowed tiles it replaced came to draw unaudited African borders under
   * ours for a while.
   */
  it("does not let a raster become our boundaries", () => {
    for (const id of ["coastline", "boundary-country", "boundary-disputed", "boundary-state"]) {
      expect(indexOf(id), `${id} must survive the raster`).toBeGreaterThan(indexOf(DATA_ANCHOR_ID));
    }
    expect(layerOf("boundary-disputed")).toMatchObject({ paint: { "line-dasharray": [2, 2] } });
  });
});

describe("asset references", () => {
  /** A layer naming a source that is not declared is dropped by MapLibre without a word. */
  it("name a declared source", () => {
    const declared = Object.keys(GREY_BASEMAP.sources);
    for (const layer of GREY_BASEMAP.layers) {
      if (!("source" in layer) || layer.source === undefined) continue;
      expect(declared, `${layer.id} names an undeclared source`).toContain(layer.source);
    }
  });

  /**
   * Nothing draws an icon, which is why no sprite is declared. The two travel
   * together: an `icon-image` added later without a sprite is a label that
   * silently loses half of itself.
   */
  it("ask for no icon, and so declare no sprite", () => {
    for (const layer of GREY_BASEMAP.layers) {
      if (layer.type !== "symbol") continue;
      expect(layer.layout?.["icon-image"], `${layer.id} wants an icon but the style has no sprite`).toBeUndefined();
    }
    expect(GREY_BASEMAP.sprite).toBeUndefined();
  });

  /**
   * Every address in the style, in one place. The viewer's deployment promise
   * (`docs/done-when-check.md`) is that it reaches GeoRiva and OpenFreeMap and
   * nothing else, and this module is the only one in the bundle that names a
   * host at all. A new absolute URL here — a hillshade, a sprite, a borrowed
   * raster — is the one change that can break that promise without touching a
   * single GeoRiva route.
   */
  it("reach no host but OpenFreeMap", () => {
    const urls = [
      GREY_BASEMAP.glyphs,
      GREY_BASEMAP.sprite,
      ...Object.values(GREY_BASEMAP.sources).flatMap((source) => {
        const declared = source as { url?: string; tiles?: string[] };
        return [declared.url, ...(declared.tiles ?? [])];
      }),
    ].filter((url): url is string => typeof url === "string");

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      if (!/^https?:\/\//.test(url)) continue;
      expect(new URL(url).host, `${url} is not a host this viewer may reach`).toBe("tiles.openfreemap.org");
    }
  });

  /** A font the glyph server has not got is a label that never appears. */
  it("ask only for fonts OpenFreeMap serves", () => {
    const available = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
    for (const layer of GREY_BASEMAP.layers) {
      if (layer.type !== "symbol") continue;
      for (const font of (layer.layout?.["text-font"] as string[] | undefined) ?? []) {
        expect(available, `${layer.id} asks for a font that is not served`).toContain(font);
      }
    }
  });
});

describe("the places with values", () => {
  const VALUED = ["city-lg", "city-md", "city-sm", "town"];
  const placeLayer = (id: string) => layerOf(id) as unknown as { source: string; "source-layer"?: string };

  /**
   * The viewer fills this source; a label layer still reading the tiles would
   * draw the name without the value, which looks like a frame that has not
   * loaded rather than a bug.
   */
  it("are read from the source the viewer fills", () => {
    expect(GREY_BASEMAP.sources[PLACES_SOURCE_ID]).toMatchObject({ type: "geojson" });
    for (const id of VALUED) {
      expect(placeLayer(id).source, `${id} does not read the places source`).toBe(PLACES_SOURCE_ID);
      // A source-layer means nothing to a GeoJSON source, and MapLibre drops the layer for it.
      expect(placeLayer(id)["source-layer"], `${id} still names a tile layer`).toBeUndefined();
    }
  });

  /**
   * The source holds only what `places.ts` keeps, so a class a layer filters
   * for that the module drops is a tier of names that silently never appears.
   */
  it("are filtered to classes the viewer keeps", () => {
    for (const id of VALUED) {
      const classes = JSON.stringify(layerOf(id).filter).match(/"(city|town|village|suburb|island|country)"/g) ?? [];
      for (const quoted of classes) {
        expect(VALUED_CLASSES, `${id} filters for a class places.ts drops`).toContain(JSON.parse(quoted));
      }
    }
  });

  it("leave countries and islands on the tiles, with no value", () => {
    for (const id of ["country-lg", "country-md", "country-sm", "island"]) {
      expect(placeLayer(id).source, `${id} moved off the tiles`).toBe("openmaptiles");
    }
  });
});

/**
 * The shadow switched off, which is what a server that has not rendered the
 * pyramid serves — and the default, since the tiles ship with nobody.
 */
describe("without the shore shadow", () => {
  /**
   * Not hidden: *absent*, source and all. A layer with `visibility: none`
   * still carries its source, and MapLibre loads a raster source's tiles for
   * the viewport regardless — which against a pyramid that was never rendered
   * is a few hundred 404s on every pan. Switching the shadow off has to mean
   * the style does not know the tiles exist.
   */
  it("declares neither the layer nor its source", () => {
    expect(without.layers.map((layer) => layer.id)).not.toContain("shore-shadow");
    expect(without.sources["shore-shadow"]).toBeUndefined();
  });

  /** Everything else is the same map: the anchor still divides it in two. */
  it("keeps the anchor between the ground and what is read over it", () => {
    const ids = without.layers.map((layer) => layer.id);
    const anchor = ids.indexOf(DATA_ANCHOR_ID);
    expect(anchor).toBeGreaterThan(-1);
    for (const id of ["ground", "lake", "waterway"]) expect(ids.indexOf(id)).toBeLessThan(anchor);
    for (const id of ["coastline", "boundary-country"]) expect(ids.indexOf(id)).toBeGreaterThan(anchor);
  });

  /** The same trap as the sprite: a layer naming a source MapLibre drops in silence. */
  it("leaves no layer naming a source it no longer declares", () => {
    const declared = Object.keys(without.sources);
    for (const layer of without.layers) {
      if (!("source" in layer) || layer.source === undefined) continue;
      expect(declared, `${layer.id} names an undeclared source`).toContain(layer.source);
    }
  });
});
