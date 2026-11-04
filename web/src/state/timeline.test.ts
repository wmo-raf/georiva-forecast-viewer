import { describe, expect, it } from "vitest";
import type { EdrCollection, RunsResponse } from "../api/types";
import { buildTimeline, stepIndex } from "./timeline";

function run(reference_time: string, complete = true) {
  return { reference_time, complete, status: complete ? "closed" : "open", revision: 0, version: 1 };
}

const runs: RunsResponse = {
  catalog: "models",
  collection: "ecmwf-ifs",
  latest_complete: run("2026-11-03T12:00:00+00:00"),
  runs: [
    run("2026-11-04T00:00:00+00:00", false),
    run("2026-11-03T12:00:00+00:00"),
    run("2026-11-03T00:00:00+00:00"),
  ],
};

const edr: EdrCollection = {
  extent: { spatial: { bbox: [[-180, -90, 180, 90]] } },
  parameter_names: {},
  "x-georiva": {
    runs: [
      { reference_time: "2026-11-04T00:00:00+00:00", valid_times: ["2026-11-04T00:00:00+00:00"] },
      {
        reference_time: "2026-11-03T12:00:00+00:00",
        valid_times: ["2026-11-03T12:00:00+00:00", "2026-11-03T15:00:00+00:00", "2026-11-03T18:00:00+00:00"],
      },
      { reference_time: "2026-11-03T00:00:00+00:00", valid_times: ["2026-11-03T00:00:00+00:00"] },
    ],
  },
};

describe("the timeline joins the runs route to EDR on reference time", () => {
  it("offers only complete runs, newest first", () => {
    const timeline = buildTimeline(runs, edr);
    expect(timeline.runs.map((r) => r.reference_time)).toEqual([
      "2026-11-03T12:00:00+00:00",
      "2026-11-03T00:00:00+00:00",
    ]);
  });

  it("defaults to the latest complete run", () => {
    expect(buildTimeline(runs, edr).selected).toBe("2026-11-03T12:00:00+00:00");
  });

  it("gives each run its valid times from EDR", () => {
    const timeline = buildTimeline(runs, edr);
    expect(timeline.runs[0].valid_times).toHaveLength(3);
    expect(timeline.runs[1].valid_times).toEqual(["2026-11-03T00:00:00+00:00"]);
  });

  it("drops a complete run EDR has no items for", () => {
    const withGhost = { ...runs, runs: [...runs.runs, run("2026-11-02T12:00:00+00:00")] };
    expect(buildTimeline(withGhost, edr).runs).toHaveLength(2);
  });

  it("has nothing selected when no run is complete", () => {
    const none = { ...runs, latest_complete: null, runs: [run("2026-11-04T00:00:00+00:00", false)] };
    const timeline = buildTimeline(none, edr);
    expect(timeline.runs).toEqual([]);
    expect(timeline.selected).toBeNull();
  });
});

describe("stepping wraps within the run", () => {
  it("steps forward and wraps to the start", () => {
    expect(stepIndex(0, 3, +1)).toBe(1);
    expect(stepIndex(2, 3, +1)).toBe(0);
  });
  it("steps back and wraps to the end", () => {
    expect(stepIndex(0, 3, -1)).toBe(2);
  });
  it("stays put with no steps", () => {
    expect(stepIndex(0, 0, +1)).toBe(0);
  });
});
