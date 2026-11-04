import { describe, expect, it } from "vitest";
import { WORLD_SHIFTS } from "./longitude";

describe("the copies of the world a longitude may be found in", () => {
  it("is the rectangle itself and one world either side", () => {
    expect([...WORLD_SHIFTS].sort((a, b) => a - b)).toEqual([-360, 0, 360]);
  });
});
