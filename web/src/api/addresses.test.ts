import { describe, expect, it } from "vitest";
import { catalogueUrl, edrCollectionUrl, encodedPreviewUrl, runsUrl, vectorPreviewUrl } from "./addresses";

const source = {
  slug: "ifs",
  name: "ECMWF IFS",
  catalog: "models",
  collection: "ecmwf-ifs",
  variable: "t2m",
  descriptor: "",
  version: "ab12cd34",
};

const wind = { ...source, variable: undefined, u: "10u", v: "10v", version: "ef56ab78" };

describe("every address the viewer asks GeoRiva for", () => {
  it("the catalogue", () => {
    expect(catalogueUrl()).toBe("/api/forecast-viewer/");
  });

  it("a source's runs, by catalog and collection, at the route's maximum", () => {
    expect(runsUrl(source)).toBe("/api/runs/models/ecmwf-ifs/?limit=200");
  });

  it("a source's EDR description, by collection alone", () => {
    expect(edrCollectionUrl(source)).toBe("/api/edr/collections/ecmwf-ifs/");
  });

  it("the encoded texture of one step, under the organisation, keyed by the render-config token", () => {
    const url = encodedPreviewUrl("kmd", source, "t2m", "2026-11-03T15:00:00+00:00", "2026-11-03T12:00:00+00:00");
    expect(url).toBe(
      "/titiler/kmd/models/ecmwf-ifs/t2m/encoded-preview.png" +
        "?time=2026-11-03T15%3A00%3A00%2B00%3A00&reftime=2026-11-03T12%3A00%3A00%2B00%3A00&v=ab12cd34",
    );
  });

  it("another variable of the same source, keyed by that variable's own token", () => {
    const url = encodedPreviewUrl("kmd", source, "msl", "2026-11-03T15:00:00+00:00", null, "ee99ff00");
    expect(url).toBe("/titiler/kmd/models/ecmwf-ifs/msl/encoded-preview.png?time=2026-11-03T15%3A00%3A00%2B00%3A00&v=ee99ff00");
  });

  it("the two-band vector texture, on the collection, with the pair named in the query", () => {
    const url = vectorPreviewUrl("kmd", wind, "2026-11-03T15:00:00+00:00", "2026-11-03T12:00:00+00:00");
    expect(url).toBe(
      "/titiler/kmd/models/ecmwf-ifs/vector-preview.png" +
        "?u_variable=10u&v_variable=10v&time=2026-11-03T15%3A00%3A00%2B00%3A00" +
        "&reftime=2026-11-03T12%3A00%3A00%2B00%3A00&v=ef56ab78",
    );
  });

  it("leaves reftime off a vector texture when the source has no run", () => {
    expect(vectorPreviewUrl("kmd", wind, "2026-11-03T15:00:00Z", null)).toBe(
      "/titiler/kmd/models/ecmwf-ifs/vector-preview.png" +
        "?u_variable=10u&v_variable=10v&time=2026-11-03T15%3A00%3A00Z&v=ef56ab78",
    );
  });

  it("has no vector address for a source that is not a bound pair", () => {
    expect(() => vectorPreviewUrl("kmd", source, "2026-11-03T15:00:00Z", null)).toThrow(/u and v/);
  });
});
