import { describe, expect, it } from "vitest";
import { Framer, extentOf, fitPadding, inside, type Extent } from "./framing";

const KENYA: Extent = [33.9, -4.7, 41.9, 5.1];
const WORLD: Extent = [-180, -90, 180, 90];
const AFRICA_VIEW: Extent = [-20, -35, 55, 38];
const NAIROBI_VIEW: Extent = [36.5, -1.6, 37.1, -1.0];

describe("whether the data is already on screen", () => {
  it("is when the whole view lies inside the bounds", () => {
    expect(inside(NAIROBI_VIEW, KENYA)).toBe(true);
  });

  it("is not when any edge of the view is outside them", () => {
    expect(inside(AFRICA_VIEW, KENYA)).toBe(false);
    expect(inside([40, -2, 45, 2], KENYA)).toBe(false);
  });

  it("always is for a global model", () => {
    expect(inside(AFRICA_VIEW, WORLD)).toBe(true);
    expect(inside(NAIROBI_VIEW, WORLD)).toBe(true);
  });
});

describe("reading a bounding box", () => {
  it("takes the first box of EDR's nested list", () => {
    expect(extentOf([[33.9, -4.7, 41.9, 5.1]])).toEqual(KENYA);
  });

  it("takes a flat box as it is", () => {
    expect(extentOf([33.9, -4.7, 41.9, 5.1])).toEqual(KENYA);
  });

  it("is nothing for anything that is not four numbers", () => {
    expect(extentOf(undefined)).toBeNull();
    expect(extentOf([])).toBeNull();
    expect(extentOf([[1, 2, 3]])).toBeNull();
    expect(extentOf([1, 2, "3", 4])).toBeNull();
  });
});

describe("the room the chrome leaves", () => {
  it("keeps the area clear of the bottom bar, and of the rail while it is open", () => {
    expect(fitPadding({ narrow: false, railOpen: true })).toEqual({ top: 40, right: 40, bottom: 140, left: 230 });
    expect(fitPadding({ narrow: false, railOpen: false }).left).toBe(40);
  });

  it("on a narrow screen, keeps it clear of the taller bottom stack and little else", () => {
    expect(fitPadding({ narrow: true, railOpen: true })).toEqual({ top: 60, right: 16, bottom: 230, left: 16 });
  });
});

describe("framing a switch", () => {
  it("fits once the new bounds arrive, when the view is not inside them", () => {
    const framer = new Framer();
    framer.request();
    expect(framer.arrived(AFRICA_VIEW, KENYA)).toEqual(KENYA);
    // Once only: the same bounds arriving again move nothing.
    expect(framer.arrived(AFRICA_VIEW, KENYA)).toBeNull();
  });

  it("does nothing when the view is already inside them", () => {
    const framer = new Framer();
    framer.request();
    expect(framer.arrived(NAIROBI_VIEW, KENYA)).toBeNull();
  });

  it("never moves for a global model", () => {
    const framer = new Framer();
    framer.request();
    expect(framer.arrived(AFRICA_VIEW, WORLD)).toBeNull();
  });

  it("gives way to a user who moved the map before the bounds came", () => {
    const framer = new Framer();
    framer.request();
    framer.userMoved();
    expect(framer.arrived(AFRICA_VIEW, KENYA)).toBeNull();
  });

  it("does nothing with bounds nobody asked to be framed", () => {
    expect(new Framer().arrived(AFRICA_VIEW, KENYA)).toBeNull();
  });

  it("takes a fresh switch after a move as a fresh request", () => {
    const framer = new Framer();
    framer.request();
    framer.userMoved();
    framer.request();
    expect(framer.arrived(AFRICA_VIEW, KENYA)).toEqual(KENYA);
  });
});
