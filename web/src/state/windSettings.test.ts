import { describe, expect, it } from "vitest";
import { memoryStorage } from "../test-support/memoryStorage";
import { DEFAULT_WIND, STORAGE_KEY, loadWindSettings, sanitize, saveWindSettings } from "./windSettings";

describe("reading stored wind settings", () => {
  it("takes the defaults when nothing was stored", () => {
    expect(loadWindSettings(memoryStorage())).toEqual(DEFAULT_WIND);
    expect(loadWindSettings(null)).toEqual(DEFAULT_WIND);
  });

  it("gives back what was saved", () => {
    const storage = memoryStorage();
    const settings = { on: false, speed: 40, width: 2.2, life: 50, density: 2 as const };
    saveWindSettings(settings, storage);
    expect(loadWindSettings(storage)).toEqual(settings);
  });

  it("falls back to the defaults when storage throws or holds garbage", () => {
    expect(loadWindSettings(memoryStorage({}, true))).toEqual(DEFAULT_WIND);
    expect(loadWindSettings(memoryStorage({ [STORAGE_KEY]: "{not json" }))).toEqual(DEFAULT_WIND);
  });

  it("does not throw when saving to storage that refuses it", () => {
    expect(() => saveWindSettings(DEFAULT_WIND, memoryStorage({}, true))).not.toThrow();
  });
});

describe("cleaning a stored value", () => {
  it("defaults each bad field on its own and keeps the good ones", () => {
    expect(sanitize({ on: "yes", speed: 30, width: null, life: Number.NaN, density: 3 })).toEqual({
      ...DEFAULT_WIND,
      speed: 30,
    });
  });

  it("clamps numbers into their ranges", () => {
    expect(sanitize({ speed: 500, width: 0, life: -4 })).toMatchObject({ speed: 60, width: 0.5, life: 10 });
  });

  it("treats something that is not an object as nothing stored", () => {
    expect(sanitize(42)).toEqual(DEFAULT_WIND);
    expect(sanitize(null)).toEqual(DEFAULT_WIND);
  });
});
