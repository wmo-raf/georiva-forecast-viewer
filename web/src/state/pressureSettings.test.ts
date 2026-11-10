import { describe, expect, it } from "vitest";
import { memoryStorage } from "./memoryStorage";
import {
  DEFAULT_PRESSURE,
  STORAGE_KEY,
  loadPressureSettings,
  pressureWanted,
  sanitizePressure,
  savePressureSettings,
} from "./pressureSettings";

describe("reading stored pressure settings", () => {
  it("starts with both switches off, so the map opens as it always has", () => {
    expect(DEFAULT_PRESSURE).toEqual({ isobars: false, highLow: false });
    expect(loadPressureSettings(memoryStorage())).toEqual(DEFAULT_PRESSURE);
    expect(loadPressureSettings(null)).toEqual(DEFAULT_PRESSURE);
  });

  it("gives back what was saved", () => {
    const storage = memoryStorage();
    savePressureSettings({ isobars: true, highLow: false }, storage);
    expect(loadPressureSettings(storage)).toEqual({ isobars: true, highLow: false });
  });

  it("keeps its own key, apart from the wind's", () => {
    expect(STORAGE_KEY).toBe("georiva-forecast-viewer:pressure");
  });

  it("falls back to the defaults when storage throws or holds garbage", () => {
    expect(loadPressureSettings(memoryStorage({}, true))).toEqual(DEFAULT_PRESSURE);
    expect(loadPressureSettings(memoryStorage({ [STORAGE_KEY]: "{not json" }))).toEqual(DEFAULT_PRESSURE);
  });

  it("does not throw when saving to storage that refuses it", () => {
    expect(() => savePressureSettings(DEFAULT_PRESSURE, memoryStorage({}, true))).not.toThrow();
  });
});

describe("cleaning a stored value", () => {
  it("defaults each bad field on its own and keeps the good ones", () => {
    expect(sanitizePressure({ isobars: true, highLow: "yes" })).toEqual({ isobars: true, highLow: false });
  });

  it("treats something that is not an object as nothing stored", () => {
    expect(sanitizePressure(42)).toEqual(DEFAULT_PRESSURE);
  });
});

describe("whether the pressure texture is worth fetching", () => {
  it("is wanted while either switch is on", () => {
    expect(pressureWanted({ isobars: true, highLow: false })).toBe(true);
    expect(pressureWanted({ isobars: false, highLow: true })).toBe(true);
  });

  it("is not wanted with both off: a user who never opens the dropup pays no request", () => {
    expect(pressureWanted({ isobars: false, highLow: false })).toBe(false);
  });
});
