/**
 * Reading a value off a texture that is already on screen.
 *
 * Nothing in the UI calls this yet — the readout it was built for is deferred
 * (#4) — but the capability is the point and it is cheap: the pixels under a
 * point were fetched to draw the frame, and they are values rather than
 * colours (ADR 0021), so any feature that wants a number at a place needs no
 * request of its own to get one.
 *
 * A scalar code is decoded as core decodes it (`colourTable.ts`): through the
 * variable's encoding curve, over the response's `X-Image-Unscale`. That is
 * what makes a number agree with the colour the table puts over it, and with
 * every other GeoRiva readout of the same code. A value beyond the style's
 * stops is still read where the map draws it transparent: the transparency is
 * the style's choice of what to show, and the value is still the forecast's.
 * A wind pair is linear, `mix(low, high, channel / 255)` — the expression
 * checked against both models' COGs in `docs/wind-direction-check.md`.
 *
 * Nearest pixel, not interpolated. The texture is the model's own grid at
 * preview resolution, so a cell is the finest thing the model actually says,
 * and smoothing between cells would invent values the forecast does not make.
 */

import type { Encoding } from "../api/types";
import { decode } from "./colourTable";
import { WORLD_SHIFTS } from "./longitude";
import type { Texture } from "./texture";

/** The two components of a wind pair, eastward and northward. */
export interface Vector {
  u: number;
  v: number;
}

/** A pixel's colour channels, which for these textures are values. */
interface Channels {
  red: number;
  green: number;
}

/**
 * The column a longitude falls in, or `null` when it falls outside the texture.
 *
 * The cursor is compared against the texture's rectangle and its copies either
 * side, because a view panned over the antimeridian reaches the data there
 * (see `longitude.ts`).
 */
function column(lon: number, west: number, east: number, width: number): number | null {
  for (const shift of WORLD_SHIFTS) {
    const shifted = lon + shift;
    if (shifted >= west && shifted <= east) {
      return Math.min(Math.floor(((shifted - west) / (east - west)) * width), width - 1);
    }
  }
  return null;
}

/** The row a latitude falls in, counting from the northern edge as the image does. */
function row(lat: number, south: number, north: number, height: number): number | null {
  if (lat < south || lat > north) return null;
  return Math.min(Math.floor(((north - lat) / (north - south)) * height), height - 1);
}

/**
 * The channels of the pixel under a point, or `null` when the point is off the
 * texture or the texture reports no data there.
 *
 * Alpha below full means the pixel carries no value: that is how the tile
 * server reports a nodata cell and the area a display clip crops away (ADR
 * 0038), and for a wind pair it means at least one of the two components is
 * missing, which is no vector at all. A caller cannot tell that from a texture
 * that has not loaded, so one that shows a reading has to say which it means.
 */
function pixelAt(texture: Texture, lon: number, lat: number): Channels | null {
  const [west, south, east, north] = texture.bounds;
  if (east <= west || north <= south) return null;
  const { data, width, height } = texture.image;
  const col = column(lon, west, east, width);
  const line = row(lat, south, north, height);
  if (col === null || line === null) return null;
  const at = (line * width + col) * 4;
  if (data[at + 3] < 255) return null;
  return { red: data[at], green: data[at + 1] };
}

function unscale(channel: number, [low, high]: readonly [number, number]): number {
  return low + ((high - low) * channel) / 255;
}

/**
 * The scalar quantity under a point, in the variable's served unit, decoded
 * through `encoding`'s curve (linear where there is none).
 */
export function readValue(texture: Texture, lon: number, lat: number, encoding?: Encoding | null): number | null {
  const pixel = pixelAt(texture, lon, lat);
  return pixel ? decode(pixel.red, texture.unscale, encoding) : null;
}

/**
 * The wind pair under a point: red unscales to u and green to v, over the one
 * range both bands were encoded with (core's #593).
 */
export function readVector(texture: Texture, lon: number, lat: number): Vector | null {
  const pixel = pixelAt(texture, lon, lat);
  if (!pixel) return null;
  return { u: unscale(pixel.red, texture.unscale), v: unscale(pixel.green, texture.unscale) };
}
