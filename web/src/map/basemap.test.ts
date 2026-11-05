import { describe, expect, it } from "vitest";
import { DATA_ANCHOR_ID, GREY_BASEMAP } from "./basemap";

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

    const ground = ["ground", "lake", "waterway", "shore-shadow"];
    const over = ["coastline", "boundary-country", "boundary-disputed", "boundary-state"];
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
   * It goes last in the ground, so nothing there can paint over it. An earlier
   * version put it first, behind an opaque ocean fill, and drew nothing at all
   * — no error, no warning, just a shore with no shadow.
   */
  it("is the last thing drawn in the ground", () => {
    const anchor = indexOf(DATA_ANCHOR_ID);
    expect(indexOf("shore-shadow")).toBe(anchor - 1);
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
