/**
 * The viewer's half of a style's colour table: core's `colour_table.js`
 * (wmo-raf/georiva #785, #787), ported.
 *
 * Which colour a texture code gets is decided once, on the server, for every
 * renderer: each style has one 256-entry colour table, and Titiler colours its
 * tiles from the same one. The raster layer therefore never interpolates stops:
 * it unscales the texture by identity (`LAYER_UNSCALE`) and looks each code up
 * in the table, so a `sqrt` or `log` Variable, a stepped style and a style's
 * transparent under and over all read here as they do on every other map.
 *
 * A value is needed only where a number is shown (`map/sample.ts`), and comes
 * from decoding the code through the Variable's encoding curve: `encoding`
 * ({curve, range}, the range stored) says which fraction of the range the code
 * stands for, and that fraction of the texture's served range is the served
 * value. Decoded over the stored range first because a `log` code's fraction
 * depends on it; the unit conversion is affine, so the fraction is the same in
 * either unit. No `encoding` decodes linearly.
 */

import type { ColourTable, EdrParameter, Encoding, PaletteStop } from "../api/types";

export const TOP_CODE = 255;

/** The raster layer's unscale: a code is its own value, the table's index. */
export const LAYER_UNSCALE: [number, number] = [0, TOP_CODE];

/** The table as a WeatherLayers palette over codes: `[[code, [r, g, b, a]], ...]`. */
export function layerPalette(table: ColourTable | null | undefined): PaletteStop[] {
  if (!Array.isArray(table) || table.length === 0) {
    // A styleless variable's table: grayscale.
    return [
      [0, [0, 0, 0, 255]],
      [TOP_CODE, [255, 255, 255, 255]],
    ];
  }
  return table.map((colour, code) => [code, colour]);
}

/**
 * Which fraction of the range (0–1) a code stands for, through the curve: the
 * inverse of `code = 255 · f(t)`, as core's `colour_table.decode`.
 */
export function fraction(code: number, encoding?: Encoding | null): number {
  const f = code / TOP_CODE;
  const curve = encoding?.curve;
  if (curve === "sqrt") return f * f;
  if (curve === "log" && encoding) {
    // v = vmin · (vmax/vmin)^f over the stored range, as a fraction of it.
    const ratio = encoding.range[1] / encoding.range[0];
    return (ratio ** f - 1) / (ratio - 1);
  }
  return f;
}

/** The value a code stands for over the served range `[low, high]`, through `encoding`'s curve. */
export function decode(code: number, [low, high]: readonly [number, number], encoding?: Encoding | null): number {
  return low + fraction(code, encoding) * (high - low);
}

/** The first core release whose EDR description carries a render contract the viewer can draw. */
export const MINIMUM_CORE = "0.5.0";

/**
 * Why a parameter cannot be drawn as core draws it, or null when it can: a core
 * older than {@link MINIMUM_CORE} describes a variable by its stops alone, and
 * the viewer no longer guesses at a map from those.
 */
export function renderContractGap(parameter: EdrParameter | null | undefined): string | null {
  if (!parameter) return null;
  const hints = parameter["x-georiva"];
  const missing = (["colour_table", "encoding", "legend"] as const).filter((key) => !hints?.[key]);
  if (missing.length === 0) return null;
  return `this viewer needs GeoRiva core ${MINIMUM_CORE} or later: the variable's description carries no ${missing.join(", ")}`;
}
