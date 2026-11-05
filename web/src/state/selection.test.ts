import { describe, expect, it } from "vitest";
import type { Catalogue } from "../api/types";
import { initialSelection, selectQuantity, selectSource, sourcesFor } from "./selection";

const ifs = { slug: "ifs", name: "ECMWF IFS", catalog: "models", collection: "ecmwf-ifs", version: "v1", descriptor: "" };
const wrf = { slug: "wrf", name: "KMD WRF", catalog: "models", collection: "wrf-3km", version: "v2", descriptor: "" };

const catalogue: Catalogue = {
  config: { org: "kmd", org_name: "KMD", default_view: { center: [20, 0], zoom: 3 } },
  quantities: [
    {
      slug: "t2m",
      name: "2 m temperature",
      kind: "scalar",
      icon: "",
      sources: [
        { ...ifs, variable: "t2m" },
        { ...wrf, variable: "t2" },
      ],
    },
    { slug: "rh", name: "Humidity", kind: "scalar", icon: "", sources: [{ ...ifs, variable: "r2" }] },
    { slug: "wind10", name: "10 m wind", kind: "vector", icon: "wind", sources: [{ ...wrf, u: "u10", v: "v10" }] },
  ],
};

describe("the quantity is the primary selection", () => {
  it("opens on the first quantity and its first source", () => {
    expect(initialSelection(catalogue)).toEqual({ quantity: "t2m", source: "ifs" });
  });

  it("lists only the sources bound to the selected quantity", () => {
    expect(sourcesFor(catalogue, "rh").map((s) => s.slug)).toEqual(["ifs"]);
    expect(sourcesFor(catalogue, "t2m").map((s) => s.slug)).toEqual(["ifs", "wrf"]);
  });

  it("keeps the source across a quantity switch when the new quantity has it", () => {
    const state = { quantity: "t2m", source: "wrf" };
    expect(selectQuantity(catalogue, state, "wind10")).toEqual({ quantity: "wind10", source: "wrf" });
  });

  it("moves to the first available source when the new quantity lacks the current one", () => {
    const state = { quantity: "t2m", source: "wrf" };
    expect(selectQuantity(catalogue, state, "rh")).toEqual({ quantity: "rh", source: "ifs" });
  });

  it("switches source within the quantity", () => {
    const state = { quantity: "t2m", source: "ifs" };
    expect(selectSource(catalogue, state, "wrf")).toEqual({ quantity: "t2m", source: "wrf" });
  });

  it("ignores a source the quantity is not bound to", () => {
    const state = { quantity: "rh", source: "ifs" };
    expect(selectSource(catalogue, state, "wrf")).toEqual(state);
  });

  it("has no selection when the catalogue is empty", () => {
    expect(initialSelection({ ...catalogue, quantities: [] })).toBeNull();
  });
});
