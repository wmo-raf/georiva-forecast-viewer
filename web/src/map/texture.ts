/**
 * One encoded texture, with the two facts only its response carries.
 *
 * Titiler derives the image per request (ADR 0021) and says in headers what
 * it drew: `X-Image-Bounds`, which can be narrower than the collection's
 * extent when display clipping crops the map (ADR 0038), and
 * `X-Image-Unscale`, the range the pixels were rescaled over. Reading them
 * off the response is the only way to be right about both, so the PNG is
 * fetched here and decoded by the browser into the RGBA pixels WeatherLayers
 * takes as a texture. Its own loader picks a decoder from the URL's
 * extension, which a fetched body no longer has.
 */

import type { TextureData } from "weatherlayers-gl";

export interface Texture {
  image: TextureData;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  unscale: [number, number];
}

function numbers(header: string | null, expected: number, name: string): number[] {
  const parts = (header ?? "").split(",").map(Number);
  if (parts.length !== expected || parts.some(Number.isNaN)) {
    throw new Error(`texture response lacks a usable ${name} header`);
  }
  return parts;
}

async function decodePng(blob: Blob): Promise<TextureData> {
  // No premultiply and no colour management: the channels are values, not colours.
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2d context to decode the texture with");
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * What the tile server said went wrong, when it said anything.
 *
 * A refusal here carries a sentence worth reading — a vector pair whose two
 * components turn out to be on different grids answers 422 and explains that
 * (ADR 0021's amendment), and that is the one failure the contract predicts.
 * A bare status code would throw the explanation away.
 */
async function refusal(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Not JSON, or an empty body: the status is all there is to report.
  }
  return `${response.status} ${response.statusText}`.trim();
}

export async function loadTexture(url: string): Promise<Texture> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await refusal(response));
  const bounds = numbers(response.headers.get("X-Image-Bounds"), 4, "X-Image-Bounds");
  const unscale = numbers(response.headers.get("X-Image-Unscale"), 2, "X-Image-Unscale");
  const image = await decodePng(await response.blob());
  return {
    image,
    bounds: bounds as Texture["bounds"],
    unscale: unscale as Texture["unscale"],
  };
}
