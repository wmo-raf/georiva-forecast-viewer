import { describe, expect, it } from "vitest";
import { catalogueUrl, edrCollectionUrl, encodedPreviewUrl, runsUrl } from "./addresses";

const source = { slug: "ifs", name: "ECMWF IFS", catalog: "models", collection: "ecmwf-ifs", variable: "t2m" };

describe("every address the viewer asks GeoRiva for", () => {
  it("the catalogue", () => {
    expect(catalogueUrl()).toBe("/api/forecast-viewer/");
  });

  it("a source's runs, by catalog and collection", () => {
    expect(runsUrl(source)).toBe("/api/runs/models/ecmwf-ifs/");
  });

  it("a source's EDR description, by collection alone", () => {
    expect(edrCollectionUrl(source)).toBe("/api/edr/collections/ecmwf-ifs/");
  });

  it("the encoded texture of one step, under the organisation", () => {
    const url = encodedPreviewUrl("kmd", source, "t2m", "2026-11-03T15:00:00+00:00", "2026-11-03T12:00:00+00:00");
    expect(url).toBe(
      "/titiler/kmd/models/ecmwf-ifs/t2m/encoded-preview.png" +
        "?time=2026-11-03T15%3A00%3A00%2B00%3A00&reftime=2026-11-03T12%3A00%3A00%2B00%3A00",
    );
  });
});
