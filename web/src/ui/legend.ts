/**
 * The legend's bar, computed from what EDR says about the variable.
 *
 * The palette's stops carry their own data values (core's render contract), and
 * `palette_min`/`palette_max` beside them are the span to draw them over — a
 * display hint, deliberately not the texture's encoding range. So the bar is
 * placed from the hint when there is one, and from the stops themselves when
 * there is not, rather than from each end of the list: nothing promises the
 * style editor's snapshot arrives sorted, and a reversed list would otherwise
 * draw the palette backwards.
 */

import type { PaletteStop } from "../api/types";

export interface Tick {
  value: number;
  /** The value as it is printed under the bar. */
  label: string;
  /** Percent across the bar, so a tick can sit under the colour it names. */
  at: number;
}

export interface LegendBar {
  gradient: string;
  ticks: Tick[];
}

/** About this many labels along the bar, chosen from the palette's own stops. */
const TICKS = 6;

/**
 * A stop's value as a label: three significant figures is enough to tell two
 * stops apart, and a large value has no use for a decimal at all.
 */
function label(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toPrecision(3)).toString();
}

function colour([, [red, green, blue, alpha]]: PaletteStop): string {
  return `rgba(${red},${green},${blue},${alpha === undefined ? 1 : alpha / 255})`;
}

/**
 * The gradient and labels for a palette over `min`–`max`, or `null` when there
 * is no bar to draw: no stops, or a range of a single value, which would divide
 * by zero and stack every label on one point.
 */
export function legendBar(
  palette: PaletteStop[] | null | undefined,
  min?: number | null,
  max?: number | null,
): LegendBar | null {
  if (!palette || palette.length === 0) return null;
  const stops = [...palette].sort((a, b) => a[0] - b[0]);
  const values = stops.map(([value]) => value);
  const low = typeof min === "number" ? min : Math.min(...values);
  const high = typeof max === "number" ? max : Math.max(...values);
  if (!(low < high)) return null;

  const at = (value: number) => ((value - low) / (high - low)) * 100;
  const gradient = `linear-gradient(to right, ${stops
    .map((stop) => `${colour(stop)} ${at(stop[0]).toFixed(1)}%`)
    .join(", ")})`;

  const every = Math.max(1, Math.round((stops.length - 1) / (TICKS - 1)));
  const ticks = values
    .filter((_, index) => index % every === 0 || index === stops.length - 1)
    .map((value) => ({ value, label: label(value), at: at(value) }));

  return { gradient, ticks };
}
