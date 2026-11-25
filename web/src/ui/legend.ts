/**
 * The legend, drawn from the one core lays out (`x-georiva.legend`, core's
 * `machine_plane/legend.py`, wmo-raf/georiva #790 and #812).
 *
 * Where each colour and each value sits along the bar is decided on the server,
 * so the viewer's legend reads like the map and like every other GeoRiva
 * legend: a continuous style laid out along the encoding curve, a stepped one
 * as equal-width blocks with a value at each boundary. Which values carry text
 * is the server's pick too, and this never adds to it. The one thing only the
 * drawing can judge is whether the picked labels fit the bar it is drawn on, so
 * a stepped legend's labels thin further here (`fitting`), as core's
 * `legend.js` thins them; a continuous legend's are drawn as picked.
 *
 * An end arrow is drawn only where the end is clamped: values beyond it take
 * the end colour. A transparent end has none, since those values are not drawn.
 *
 * Colours are composited onto the legend's own backdrop before they decide
 * anything, so a band the map draws transparent still reads as a tint and the
 * choice of text colour never depends on what the map shows underneath.
 */

import type { Rgba, ServerLegend } from "../api/types";

type Rgb = [number, number, number];

/** `--fv-panel-solid`: what the pill is painted on, so alpha has a floor. */
const BACKDROP: Rgb = [18, 26, 40];

/** Relative luminance above which a label wants dark text rather than light. */
const DARK_TEXT_ABOVE = 0.55;

const DARK_TEXT = "#111";
const LIGHT_TEXT = "#fff";

/** At most this many labels on a legend that does not say which to label, as core's `legend.js`. */
const MAX_LABELS = 6;

/** Pixels of clear space between two neighbouring labels, as core's `legend.js`. */
export const LABEL_GAP = 4;

export interface LegendLabel {
  /** The tick's index in the server's list, which is what thinning answers in. */
  index: number;
  text: string;
  /** Percent along the bar. */
  at: number;
  /** How the label hangs off its point: the ends stay inside the bar. */
  align: "start" | "middle" | "end";
  /** Near-black or near-white, whichever reads on the bar there. */
  textColour: string;
}

export interface Legend {
  /** The bar as a CSS gradient. */
  gradient: string;
  labels: LegendLabel[];
  /** Whether the labels may thin where the bar is too narrow for them. */
  stepped: boolean;
  /** The arrow's colour at each end, or null where the end is transparent and has none. */
  under: string | null;
  over: string | null;
}

/**
 * A value as core's legends print it: up to two decimals, trailing zeros
 * dropped (0.5, 1, 200, 26.85), and exponential where that would print nothing
 * useful (0.00005, 250000).
 */
export function label(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 0.01 || magnitude >= 1e5)) return value.toExponential(1);
  return String(Number(value.toFixed(magnitude < 10 ? 2 : 1)));
}

function rgba(colour: number[]): Rgba {
  const [red, green, blue, alpha] = colour;
  return [red, green, blue, alpha === undefined ? 255 : alpha];
}

/** `colour` laid over the legend's own backdrop, so the result is opaque. */
function composite([red, green, blue, alpha]: Rgba): Rgb {
  const share = alpha / 255;
  return [0, 1, 2].map((i) => Math.round([red, green, blue][i] * share + BACKDROP[i] * (1 - share))) as Rgb;
}

function css([red, green, blue]: Rgb): string {
  return `rgb(${red},${green},${blue})`;
}

/** WCAG relative luminance, which is what readable text is decided on. */
function luminance([red, green, blue]: Rgb): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The text colour that reads on an (already composited) colour. */
function textOn(colour: Rgb): string {
  return luminance(colour) > DARK_TEXT_ABOVE ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * The bar's colour at `position`, between the gradient stops either side. At a
 * stepped legend's boundary, where two stops share the position, it is the band
 * the label sits at the start of — the one after the boundary — except at the
 * very end, where only the last band is left.
 */
function colourAt(gradient: [number, Rgba][], position: number): Rgba {
  const after = gradient.findIndex(([at]) => at > position);
  if (after === -1) return rgba(gradient[gradient.length - 1][1]);
  if (after === 0) return rgba(gradient[0][1]);
  const [lowAt, lowColour] = gradient[after - 1];
  const [highAt, highColour] = gradient[after];
  const low = rgba(lowColour);
  const high = rgba(highColour);
  const share = highAt === lowAt ? 0 : (position - lowAt) / (highAt - lowAt);
  return low.map((channel, i) => Math.round(channel + share * (high[i] - channel))) as Rgba;
}

function gradientCss(gradient: [number, Rgba][]): string {
  if (gradient.length === 0) return "linear-gradient(to right, #000, #fff)";
  const stops = gradient.map(([at, colour]) => {
    const [red, green, blue, alpha] = rgba(colour);
    return `rgba(${red},${green},${blue},${alpha / 255}) ${(at * 100).toFixed(2)}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Every `every`-th of `count` indices and the last, in order. */
function everyNth(count: number, every: number): number[] {
  const picked = new Set([count - 1]);
  for (let i = 0; i < count; i += every) picked.add(i);
  return [...picked].sort((a, b) => a - b);
}

/** A legend that does not say which ticks to label: at most six, as before core's #812. */
function capped(count: number): number[] {
  return count ? everyNth(count, Math.max(1, Math.ceil((count - 1) / (MAX_LABELS - 1)))) : [];
}

/**
 * Which of the labels to show, given each one's `[left, right]` in pixels: the
 * densest every-nth under which no two overlap, both ends kept; the first alone
 * when even the two ends overlap. Positions in the returned list, not indices.
 * Core's `legend.js` `fitting`, ported.
 */
export function fitting(extents: [number, number][], gap = LABEL_GAP): number[] {
  const count = extents.length;
  for (let every = 1; every < count; every++) {
    const picked = everyNth(count, every);
    const clear = picked.every((index, at) => at === 0 || extents[picked[at - 1]][1] + gap <= extents[index][0]);
    if (clear) return picked;
  }
  return count ? [0] : [];
}

/** Where a label of `size` pixels spans on a bar `width` wide, hung as `align` says. */
export function extent(at: number, size: number, width: number, align: LegendLabel["align"]): [number, number] {
  const point = (at / 100) * width;
  const left = align === "start" ? point : align === "end" ? point - size : point - size / 2;
  return [left, left + size];
}

/** The legend to draw for core's layout, or null when there is none. */
export function legendBar(legend: ServerLegend | null | undefined): Legend | null {
  if (!legend) return null;
  const gradient = legend.gradient ?? [];
  const ticks = legend.ticks ?? [];
  const labelled = legend.labels ?? capped(ticks.length);
  const arrow = (colour: Rgba | undefined) => (colour ? css(composite(rgba(colour))) : null);

  return {
    gradient: gradientCss(gradient),
    labels: labelled
      .filter((index) => index >= 0 && index < ticks.length)
      .map((index) => {
        const [position, value] = ticks[index];
        const backdrop = gradient.length ? composite(colourAt(gradient, position)) : BACKDROP;
        return {
          index,
          text: label(value),
          at: position * 100,
          align: position <= 0 ? "start" : position >= 1 ? "end" : "middle",
          textColour: textOn(backdrop),
        };
      }),
    stepped: Boolean(legend.stepped),
    under: legend.under === "transparent" ? null : arrow(gradient[0]?.[1]),
    over: legend.over === "transparent" ? null : arrow(gradient.at(-1)?.[1]),
  };
}
