import { describe, expect, it } from "vitest";
import type { EdrParameter } from "../api/types";
import { drawnParameter, type Frame } from "./drawn";

const param = (label: string, top: number): EdrParameter => ({
  label,
  "x-georiva": { image_unscale: [0, top], palette: [[0, [0, 0, 0]], [top, [255, 255, 255]]] },
});

const temperature = param("Temperature", 50);
const precipitation = param("Precipitation", 200);

const temperatureFrame: Frame = { of: "models/ifs/t2m", parameter: temperature };

describe("the parameter a raster is drawn with is the frame's own", () => {
  it("has nothing to draw with before any frame has landed", () => {
    expect(drawnParameter(null, "models/ifs/t2m", temperature)).toBeNull();
  });

  it("keeps the old frame's palette while a switched-to quantity is still loading", () => {
    // The selection is precipitation already, but the texture on screen is
    // still temperature's: its values only make sense through its own palette.
    expect(drawnParameter(temperatureFrame, "models/ifs/tp", precipitation)).toBe(temperature);
  });

  it("follows the selected parameter once the frame on screen is a frame of it", () => {
    const edited = param("Temperature", 45);
    expect(drawnParameter(temperatureFrame, "models/ifs/t2m", edited)).toBe(edited);
  });

  it("falls back to the frame's own when the selected one is not described", () => {
    expect(drawnParameter(temperatureFrame, "models/ifs/t2m", null)).toBe(temperature);
  });
});
