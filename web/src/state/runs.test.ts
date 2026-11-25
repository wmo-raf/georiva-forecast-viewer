import { describe, expect, it } from "vitest";
import { formatRun } from "./runs";

describe("naming a model run", () => {
  it("gives the weekday, the day, the month and the hour, in UTC", () => {
    expect(formatRun("2026-11-04T03:00:00+00:00")).toBe("Wed 4 Nov 03Z");
    expect(formatRun("2026-11-25T00:00:00+00:00")).toBe("Wed 25 Nov 00Z");
    expect(formatRun("2026-11-03T12:00:00+00:00")).toBe("Tue 3 Nov 12Z");
  });

  it("pads the hour but not the day", () => {
    expect(formatRun("2026-01-09T06:00:00+00:00")).toBe("Fri 9 Jan 06Z");
  });

  it("keeps the minutes of a run that does not start on the hour", () => {
    expect(formatRun("2026-12-31T00:30:00+00:00")).toBe("Thu 31 Dec 00:30Z");
  });

  it("keeps the hour and minute in full where asked to", () => {
    expect(formatRun("2026-11-25T00:00:00+00:00", { full: true })).toBe("Wed 25 Nov 00:00Z");
    expect(formatRun("2026-12-31T00:30:00+00:00", { full: true })).toBe("Thu 31 Dec 00:30Z");
  });

  it("reads a run written in another zone as the UTC time it is", () => {
    // The same instant, written +03:00. A run named in local time would name
    // a reference time the model never produced.
    expect(formatRun("2026-11-04T06:00:00+03:00")).toBe("Wed 4 Nov 03Z");
  });
});
