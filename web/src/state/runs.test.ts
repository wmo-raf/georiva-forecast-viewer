import { describe, expect, it } from "vitest";
import { formatRun } from "./runs";

describe("naming a model run", () => {
  it("gives the day, the month and the time, in UTC", () => {
    expect(formatRun("2026-11-04T03:00:00+00:00")).toBe("4 Nov 03:00Z");
    expect(formatRun("2026-11-03T12:00:00+00:00")).toBe("3 Nov 12:00Z");
  });

  it("pads the time but not the day", () => {
    expect(formatRun("2026-01-09T06:00:00+00:00")).toBe("9 Jan 06:00Z");
    expect(formatRun("2026-12-31T00:30:00+00:00")).toBe("31 Dec 00:30Z");
  });

  it("reads a run written in another zone as the UTC time it is", () => {
    // The same instant, written +03:00. A run named in local time would name
    // a reference time the model never produced.
    expect(formatRun("2026-11-04T06:00:00+03:00")).toBe("4 Nov 03:00Z");
  });
});
