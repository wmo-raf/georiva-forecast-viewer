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
