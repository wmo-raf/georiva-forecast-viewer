import { describe, expect, it } from "vitest";
import { formatValue, placesWithValues, type SourcePlace } from "./places";

function place(
  name: string,
  [lon, lat]: [number, number],
  { cls = "city", rank = 3, id }: { cls?: string; rank?: number; id?: number } = {},
): SourcePlace {
  return { id, geometry: { type: "Point", coordinates: [lon, lat] }, properties: { name, class: cls, rank } };
}

const NAIROBI = place("Nairobi", [36.82, -1.29], { id: 1 });
const MOMBASA = place("Mombasa", [39.67, -4.04], { id: 2 });

/** A field that is the longitude, so a test can see which point was read. */
const BY_LONGITUDE = (lon: number) => lon;
const NOWHERE = () => null;

describe("a value as a label shows it", () => {
  it("is rounded to the quantity's decimals", () => {
    expect(formatValue(24.4, 0)).toBe("24");
    expect(formatValue(24.6, 0)).toBe("25");
    expect(formatValue(0.44, 1)).toBe("0.4");
    expect(formatValue(3, 1)).toBe("3.0");
  });

  it("keeps a real negative", () => {
    expect(formatValue(-3.2, 0)).toBe("-3");
  });

  it("never reads as a negative zero", () => {
    expect(formatValue(-0.3, 0)).toBe("0");
    expect(formatValue(-0.04, 1)).toBe("0.0");
  });
});

describe("the places to label", () => {
  it("carry the value at their own point", () => {
    const { features } = placesWithValues([NAIROBI, MOMBASA], BY_LONGITUDE, 1);
    expect(features.map((f) => [f.properties?.name, f.properties?.value])).toEqual([
      ["Nairobi", "36.8"],
      ["Mombasa", "39.7"],
    ]);
  });

  it("keep their name, class and rank for the label layers' filters", () => {
    const [feature] = placesWithValues([NAIROBI], BY_LONGITUDE, 0).features;
    expect(feature.properties).toMatchObject({ name: "Nairobi", class: "city", rank: 3 });
    expect(feature.geometry.coordinates).toEqual([36.82, -1.29]);
  });

  it("keep their name and carry no value where there is nothing to read", () => {
    const [feature] = placesWithValues([NAIROBI], NOWHERE, 0).features;
    expect(feature.properties?.name).toBe("Nairobi");
    expect(feature.properties).not.toHaveProperty("value");
  });

  it("are cities and towns only", () => {
    const places = [
      NAIROBI,
      place("Thika", [37.07, -1.03], { cls: "town" }),
      place("KENYA", [37.9, 0.5], { cls: "country" }),
      place("Lamu Island", [40.9, -2.27], { cls: "island" }),
      place("Kibera", [36.78, -1.31], { cls: "suburb" }),
    ];
    const names = placesWithValues(places, BY_LONGITUDE, 0).features.map((f) => f.properties?.name);
    expect(names).toEqual(["Nairobi", "Thika"]);
  });

  it("appear once, however many tiles returned them", () => {
    const names = placesWithValues([NAIROBI, NAIROBI, MOMBASA], BY_LONGITUDE, 0).features.map(
      (f) => f.properties?.name,
    );
    expect(names).toEqual(["Nairobi", "Mombasa"]);
  });

  it("appear once without an id, though a coordinate moves a little between tiles", () => {
    const here = place("Garissa", [39.6461, -0.4532]);
    const there = place("Garissa", [39.6459, -0.4529]);
    expect(placesWithValues([here, there], BY_LONGITUDE, 0).features).toHaveLength(1);
  });

  it("keep two places that share a name but not a position", () => {
    const one = place("Kitale", [35.0, 1.0]);
    const other = place("Kitale", [30.0, -5.0]);
    expect(placesWithValues([one, other], BY_LONGITUDE, 0).features).toHaveLength(2);
  });

  it("skip anything that is not a point", () => {
    const line: SourcePlace = {
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      properties: { name: "Odd", class: "city" },
    };
    expect(placesWithValues([line], BY_LONGITUDE, 0).features).toHaveLength(0);
  });
});
