import { describe, expect, it } from "vitest";
import type { Catalogue, Quantity, Source } from "../api/types";
import { selectQuantity } from "./selection";
import { WEATHER, isWeather, nearestStep, openingSelection, railView } from "./weather";

const source = (slug: string, symbols_model = ""): Source => ({
  slug,
  name: slug.toUpperCase(),
  descriptor: "",
  catalog: "models",
  collection: `${slug}-collection`,
  variable: "t2m",
  version: "v",
  symbols_model,
});

const temperature: Quantity = {
  slug: "t2m",
  name: "2 m temperature",
  kind: "scalar",
  icon: "thermometer",
  decimals: 0,
  sources: [source("ifs", "ecmwf-ifs"), source("gfs")],
};
const wind: Quantity = { ...temperature, slug: "wind10", kind: "vector", sources: [source("ifs")] };

function catalogue(weatherSources: string[], opens = true): Catalogue {
  return {
    config: { org: "kmd", org_name: "KMD", default_view: { center: [37, 0], zoom: 5 }, shore_shadow: false },
    quantities: [temperature, wind],
    weather: {
      label: "Weather",
      opens,
      sources: weatherSources.map((slug) => ({
        slug,
        name: slug.toUpperCase(),
        descriptor: "",
        catalog: "models",
        collection: `${slug}-collection`,
        symbols_model: `${slug}-model`,
      })),
    },
  };
}

describe("the rail", () => {
  it("puts Weather first, under the operator's name, then the scalar quantities", () => {
    const view = railView(catalogue(["wrf", "ifs"]));

    expect(view.quantities.map((q) => q.slug)).toEqual([WEATHER, "t2m"]);
    expect(view.quantities[0]).toMatchObject({ name: "Weather", kind: "weather", icon: "cloud-sun" });
    expect(view.quantities[0].sources.map((s) => [s.slug, s.symbols_model])).toEqual([
      ["wrf", "wrf-model"],
      ["ifs", "ifs-model"],
    ]);
  });

  it("has no Weather when no source can draw it", () => {
    expect(railView(catalogue([])).quantities.map((q) => q.slug)).toEqual(["t2m"]);
  });

  it("knows Weather from a quantity", () => {
    expect(isWeather(WEATHER)).toBe(true);
    expect(isWeather("t2m")).toBe(false);
    expect(isWeather(undefined)).toBe(false);
  });
});

describe("opening the viewer", () => {
  it("opens on Weather when the operator asks and a source can draw it", () => {
    const view = railView(catalogue(["wrf", "ifs"]));
    expect(openingSelection(view, true)).toEqual({ quantity: WEATHER, source: "wrf" });
  });

  it("opens on the first quantity when the operator says not to", () => {
    const view = railView(catalogue(["wrf"], false));
    expect(openingSelection(view, false)).toEqual({ quantity: "t2m", source: "ifs" });
  });

  it("opens on the first quantity when nothing can draw Weather, whatever the setting", () => {
    expect(openingSelection(railView(catalogue([])), true)).toEqual({ quantity: "t2m", source: "ifs" });
  });

  it("has nothing to open on an empty catalogue", () => {
    const empty = { ...catalogue([]), quantities: [] };
    expect(openingSelection(railView(empty), true)).toBeNull();
  });
});

describe("switching in and out of Weather", () => {
  it("keeps the model where both have it", () => {
    const view = railView(catalogue(["wrf", "ifs"]));
    const onIfs = { quantity: "t2m", source: "ifs" };
    expect(selectQuantity(view, onIfs, WEATHER)).toEqual({ quantity: WEATHER, source: "ifs" });
    expect(selectQuantity(view, { quantity: WEATHER, source: "ifs" }, "t2m")).toEqual({ quantity: "t2m", source: "ifs" });
  });

  it("moves to the first model that has it otherwise", () => {
    const view = railView(catalogue(["wrf", "ifs"]));
    expect(selectQuantity(view, { quantity: "t2m", source: "gfs" }, WEATHER)).toEqual({ quantity: WEATHER, source: "wrf" });
    expect(selectQuantity(view, { quantity: WEATHER, source: "wrf" }, "t2m")).toEqual({ quantity: "t2m", source: "ifs" });
  });
});

describe("carrying the time across a switch", () => {
  const hourly = ["2026-11-10T15:00:00Z", "2026-11-10T16:00:00Z", "2026-11-10T17:00:00Z", "2026-11-10T18:00:00Z"];

  it("lands on the same time where the other timeline has it", () => {
    expect(nearestStep(hourly, "2026-11-10T17:00:00Z")).toBe(2);
  });

  it("lands on the nearest time otherwise, the earlier on a tie", () => {
    const sixHourly = ["2026-11-10T12:00:00Z", "2026-11-10T18:00:00Z"];
    expect(nearestStep(sixHourly, "2026-11-10T16:00:00Z")).toBe(1);
    expect(nearestStep(sixHourly, "2026-11-10T15:00:00Z")).toBe(0);
    expect(nearestStep(hourly, "2026-11-09T00:00:00Z")).toBe(0);
  });

  it("starts at the beginning with nothing to carry", () => {
    expect(nearestStep(hourly, null)).toBe(0);
    expect(nearestStep([], "2026-11-10T17:00:00Z")).toBe(0);
  });
});
