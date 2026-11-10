import { describe, expect, it } from "vitest";
import { memoryStorage } from "../test-support/memoryStorage";
import { DEFAULT_BASEMAPS, STORAGE_KEY, basemapFor, loadBasemaps, saveBasemaps } from "./basemapChoice";

describe("which basemap a layer opens on", () => {
  it("is light for Weather and grey for the rasters, unless someone chose otherwise", () => {
    expect(DEFAULT_BASEMAPS).toEqual({ weather: "light", raster: "grey" });
    expect(basemapFor(DEFAULT_BASEMAPS, true)).toBe("light");
    expect(basemapFor(DEFAULT_BASEMAPS, false)).toBe("grey");
  });

  it("is remembered for each kind of layer on its own", () => {
    const storage = memoryStorage();
    saveBasemaps({ weather: "light", raster: "light" }, storage);
    expect(loadBasemaps(storage)).toEqual({ weather: "light", raster: "light" });
  });

  it("keeps its own key", () => {
    expect(STORAGE_KEY).toBe("georiva-forecast-viewer:basemap");
  });

  it("falls back to the defaults, field by field, on anything it cannot use", () => {
    expect(loadBasemaps(null)).toEqual(DEFAULT_BASEMAPS);
    expect(loadBasemaps(memoryStorage({}, true))).toEqual(DEFAULT_BASEMAPS);
    expect(loadBasemaps(memoryStorage({ [STORAGE_KEY]: '{"weather":"satellite","raster":"light"}' }))).toEqual({
      weather: "light",
      raster: "light",
    });
  });
});
