import { describe, expect, it } from "vitest";
import type { PlacesMatrix } from "../api/types";
import { formatTemperature, sortKey, spokenFor, symbolsAt, windArrow } from "./symbols";

/** Two towns over two 6-hourly windows, as `/api/forecast/{model}/places/` returns them. */
const MATRIX: PlacesMatrix = {
  model: "ecmwf-ifs",
  reference_time: "2026-11-10T12:00:00Z",
  bbox: [33.9, -4.7, 41.9, 5.1],
  window: { duration: "PT6H" },
  times: ["2026-11-10T15:00:00Z", "2026-11-10T18:00:00Z"],
  units: { air_temperature: "celsius", wind_speed: "m/s", precipitation_amount: "mm" },
  towns: [
    { id: 1, name: "Nairobi", rank: 1, population: 4397073, coordinates: [36.82, -1.28] },
    { id: 2, name: "Kisumu", rank: 2, population: 216479, coordinates: [34.76, -0.1] },
  ],
  values: {
    symbol_code: [
      ["rainshowers_night", "partlycloudy_night"],
      ["fair_day", null],
    ],
    air_temperature: [
      [17.4, 15.6],
      [27.3, null],
    ],
    wind_speed: [
      [1.8, 2.3],
      [4.04, null],
    ],
    wind_from_direction: [
      [83.7, 13.2],
      [270, null],
    ],
    precipitation_amount: [
      [1.0, 0.0],
      [0.0, null],
    ],
  },
};

describe("windArrow", () => {
  it("points where the wind blows to, not where it comes from", () => {
    // An easterly (from 90°) blows west.
    expect(windArrow(90)).toBe("←");
    expect(windArrow(270)).toBe("→");
    expect(windArrow(0)).toBe("↓");
    expect(windArrow(180)).toBe("↑");
  });

  it("snaps to the nearest of eight directions", () => {
    expect(windArrow(45)).toBe("↙");
    expect(windArrow(225)).toBe("↗");
    expect(windArrow(135)).toBe("↖");
    expect(windArrow(315)).toBe("↘");
    expect(windArrow(20)).toBe("↓");
    expect(windArrow(25)).toBe("↙");
    expect(windArrow(359)).toBe("↓");
  });
});

describe("formatTemperature", () => {
  it("rounds to a whole degree", () => {
    expect(formatTemperature(17.4)).toBe("17°");
    expect(formatTemperature(17.5)).toBe("18°");
  });

  it("never says minus nothing", () => {
    expect(formatTemperature(-0.3)).toBe("0°");
    expect(formatTemperature(-2.6)).toBe("-3°");
  });
});

describe("sortKey", () => {
  it("puts rank first and the bigger town first within a rank", () => {
    expect(sortKey(1, 100)).toBeLessThan(sortKey(2, 10_000_000));
    expect(sortKey(2, 500_000)).toBeLessThan(sortKey(2, 20_000));
  });
});

describe("symbolsAt", () => {
  it("gives each town its symbol and its label parts at that time", () => {
    const collection = symbolsAt(MATRIX, "2026-11-10T15:00:00Z");

    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [36.82, -1.28] },
      properties: {
        name: "Nairobi",
        rank: 1,
        sort: sortKey(1, 4397073),
        symbol: "rainshowers_night",
        temperature: "17°",
        wind: "2 m/s ←",
      },
    });
    expect(collection.features[1].properties).toMatchObject({ symbol: "fair_day", temperature: "27°", wind: "4 m/s →" });
  });

  it("marks a temperature below zero, which the label draws in blue", () => {
    const cold: PlacesMatrix = {
      ...MATRIX,
      values: { ...MATRIX.values, air_temperature: [[-1.2, null], [0.4, null]] },
    };
    const [summit, valley] = symbolsAt(cold, "2026-11-10T15:00:00Z").features;

    expect(summit.properties).toMatchObject({ temperature: "-1°", cold: true });
    expect(valley.properties).not.toHaveProperty("cold");
  });

  it("matches the time however it is spelled", () => {
    expect(symbolsAt(MATRIX, "2026-11-10T18:00:00+00:00").features[0].properties?.symbol).toBe("partlycloudy_night");
  });

  it("leaves out a town with nothing to say at that time", () => {
    const collection = symbolsAt(MATRIX, "2026-11-10T18:00:00Z");

    expect(collection.features.map((f) => f.properties?.name)).toEqual(["Nairobi"]);
  });

  it("is empty at a time the matrix does not answer", () => {
    expect(symbolsAt(MATRIX, "2026-11-10T09:00:00Z").features).toEqual([]);
    expect(symbolsAt(MATRIX, null).features).toEqual([]);
  });
});

describe("which basemap names the symbols speak for", () => {
  const drawn = symbolsAt(MATRIX, "2026-11-10T15:00:00Z");
  const coveredBy = spokenFor(drawn);

  it("is the basemap's own name for a town the symbols draw", () => {
    // OpenStreetMap's Nairobi node is a few hundred metres from GeoNames'.
    expect(coveredBy(36.817, -1.286)).toBe(true);
  });

  it("is not a place far from every drawn town, even one between them", () => {
    // Nakuru lies between Kisumu and Nairobi; Arusha is across the border.
    expect(coveredBy(36.07, -0.3)).toBe(false);
    expect(coveredBy(36.68, -3.37)).toBe(false);
  });

  it("is nothing when no symbols are drawn", () => {
    expect(spokenFor(null)(36.817, -1.286)).toBe(false);
  });
});
