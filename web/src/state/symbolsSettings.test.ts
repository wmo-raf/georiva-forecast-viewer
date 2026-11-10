import { describe, expect, it } from "vitest";
import { memoryStorage } from "../test-support/memoryStorage";
import { DEFAULT_SYMBOLS, STORAGE_KEY, loadSymbolsSettings, saveSymbolsSettings } from "./symbolsSettings";

describe("the weather symbols switch", () => {
  it("starts on, so a model with symbols opens with them", () => {
    expect(DEFAULT_SYMBOLS).toEqual({ on: true });
    expect(loadSymbolsSettings(memoryStorage())).toEqual({ on: true });
    expect(loadSymbolsSettings(null)).toEqual({ on: true });
  });

  it("remembers being switched off", () => {
    const storage = memoryStorage();
    saveSymbolsSettings({ on: false }, storage);
    expect(loadSymbolsSettings(storage)).toEqual({ on: false });
  });

  it("keeps its own key", () => {
    expect(STORAGE_KEY).toBe("georiva-forecast-viewer:symbols");
  });

  it("falls back to on when storage throws or holds garbage", () => {
    expect(loadSymbolsSettings(memoryStorage({}, true))).toEqual({ on: true });
    expect(loadSymbolsSettings(memoryStorage({ [STORAGE_KEY]: '{"on":"yes"}' }))).toEqual({ on: true });
  });
});
