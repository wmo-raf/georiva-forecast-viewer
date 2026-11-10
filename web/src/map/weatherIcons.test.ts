import { describe, expect, it } from "vitest";
import { SYMBOL_IDS } from "./symbolIds";
import { iconUrl } from "./weatherIcons";

describe("finding a symbol code's icon", () => {
  it("goes through NRK's id: partly cloudy at night is 03n", () => {
    expect(iconUrl("partlycloudy_night")).toMatch(/\/03n\.svg$/);
    expect(iconUrl("cloudy")).toMatch(/\/04\.svg$/);
  });

  it("has a file for every code met.no can return", () => {
    const missing = Object.keys(SYMBOL_IDS).filter((code) => !iconUrl(code));
    expect(missing).toEqual([]);
    expect(Object.keys(SYMBOL_IDS)).toHaveLength(83);
  });

  it("has nothing for a code it does not know", () => {
    expect(iconUrl("sunnywithachanceofmeatballs")).toBeUndefined();
  });
});
