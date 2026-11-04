import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_ICON, iconFor } from "./icons";

/** The plugin's curated set, the one list the admin offers (src/georiva_forecast_viewer/icons.json). */
const names: string[] = JSON.parse(
  readFileSync(resolve(__dirname, "../../../src/georiva_forecast_viewer/icons.json"), "utf-8"),
);

describe("every icon name the admin can choose has a glyph", () => {
  it.each(names)("%s", (name) => {
    expect(iconFor(name)).not.toBe(FALLBACK_ICON);
  });

  it("falls back for a blank or unknown name, so an older bundle never breaks", () => {
    expect(iconFor("")).toBe(FALLBACK_ICON);
    expect(iconFor("not-a-glyph")).toBe(FALLBACK_ICON);
  });
});
