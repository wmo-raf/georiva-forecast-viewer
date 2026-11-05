/**
 * The legend, computed from what EDR says about the variable.
 *
 * The palette's stops carry their own data values (core's render contract), and
 * `palette_min`/`palette_max` beside them are the span to draw them over — a
 * display hint, deliberately not the texture's encoding range.
 *
 * A palette arrives in one of two shapes and the legend draws each as what it
 * is. Core's *stepped* mode expresses every class as two stops sharing its
 * boundaries, so that the hard edges survive any linear interpolation
 * downstream; folded back up here, that pairing is exactly the class list, and
 * the legend draws one block per class with the class's own lower boundary
 * printed on it. A *continuous* palette has no classes to name, so it keeps the
 * gradient and places a few labels along it at their true share of the range.
 *
 * Either way the colours are composited onto the legend's own backdrop before
 * they are used, so a class the map draws transparent still reads as a tint and
 * nothing — least of all the choice of text colour — depends on whatever the
 * map happens to be showing underneath.
 */

import type { PaletteStop } from "../api/types";

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

/** About this many labels along a continuous bar, taken from the stops. */
const TICKS = 6;

/**
 * At most this many values printed on a stepped bar; the rest are a title.
 * What the pill affords: it is a fixed 360px, so the ramp inside it is a little
 * over 300px, and a value at 11px wants about 26px of block to sit in without
 * touching its neighbour.
 */
const MAX_LABELS = 12;

/** `--fv-panel-solid`: what the pill is painted on, so alpha has a floor. */
const BACKDROP: Rgb = [18, 26, 40];

/** Relative luminance above which a block wants dark text rather than light. */
const DARK_TEXT_ABOVE = 0.55;

const DARK_TEXT = "#111";
const LIGHT_TEXT = "#fff";

export interface LegendClass {
  /** The class's lower boundary — the value its colour begins at. */
  value: number;
  /** The boundary as printed on the block, or null where the stride drops it. */
  label: string | null;
  /** The class's full range, for a block whose label the stride dropped. */
  title: string;
  /** The class colour, composited onto the backdrop, as CSS. */
  colour: string;
  /** Near-black or near-white, whichever reads on `colour`. */
  textColour: string;
}

export interface Tick {
  value: number;
  /** The value as it is printed on the bar. */
  label: string;
  /** Percent across the bar, so a tick can sit on the colour it names. */
  at: number;
  /** Near-black or near-white, whichever reads on the gradient there. */
  textColour: string;
}

export type Legend =
  | { kind: "stepped"; classes: LegendClass[] }
  | { kind: "continuous"; gradient: string; ticks: Tick[] };

/**
 * A stop's value as a label: three significant figures is enough to tell two
 * stops apart, and a large value has no use for a decimal at all.
 */
function label(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toPrecision(3)).toString();
}

/** A stop's colour as `[r, g, b, a]`, alpha defaulting to opaque. */
function rgba([, channels]: PaletteStop): Rgba {
  const [red, green, blue, alpha] = channels;
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

/** The text colour that reads on an (already composited) block colour. */
function textOn(colour: Rgb): string {
  return luminance(colour) > DARK_TEXT_ABOVE ? DARK_TEXT : LIGHT_TEXT;
}

/** Sorted stops, which nothing upstream promises the snapshot arrives in. */
function sorted(palette: PaletteStop[]): PaletteStop[] {
  return [...palette].sort((a, b) => a[0] - b[0]);
}

interface Run {
  colour: Rgba;
  low: number;
  high: number;
}

/** Consecutive stops of one colour, folded into the span they cover. */
function runs(stops: PaletteStop[]): Run[] {
  const folded: Run[] = [];
  for (const stop of stops) {
    const colour = rgba(stop);
    const last = folded.at(-1);
    if (last && last.colour.every((channel, i) => channel === colour[i])) {
      last.high = stop[0];
    } else {
      folded.push({ colour, low: stop[0], high: stop[0] });
    }
  }
  return folded;
}

/**
 * These runs as a class list, or null where they are a ramp rather than a
 * classification. A class covers a span of values, which is what core's stepped
 * mode produces and what a ramp — one stop per colour — never does.
 *
 * A run of no span at either end is dropped before that is judged. Palettes in
 * the wild close with the colour for everything above the top of the range,
 * declared as a single stop at that top; it names no interval, covers no area
 * on the map, and is a boundary of the classification rather than a class in
 * it. A ramp survives this untouched: dropping its ends only ever leaves the
 * interior stops, which have no span either.
 */
function classification(folded: Run[]): Run[] | null {
  let first = 0;
  let last = folded.length - 1;
  if (folded[first] && folded[first].high === folded[first].low) first += 1;
  if (last >= first && folded[last].high === folded[last].low) last -= 1;
  const classes = folded.slice(first, last + 1);
  return classes.length > 0 && classes.every((run) => run.high > run.low) ? classes : null;
}

/** The colour of a ramp at `value`, interpolated between its bracketing stops. */
function sample(stops: PaletteStop[], value: number): Rgba {
  const after = stops.findIndex((stop) => stop[0] >= value);
  if (after <= 0) return rgba(stops[after === 0 ? 0 : stops.length - 1]);
  const [lowValue] = stops[after - 1];
  const [highValue] = stops[after];
  const low = rgba(stops[after - 1]);
  const high = rgba(stops[after]);
  const share = highValue === lowValue ? 0 : (value - lowValue) / (highValue - lowValue);
  return low.map((channel, i) => Math.round(channel + share * (high[i] - channel))) as Rgba;
}

/** One block per class, labelled on a stride so the numbers never collide. */
function steppedLegend(folded: Run[], unit: string): Legend {
  const every = Math.max(1, Math.ceil(folded.length / MAX_LABELS));
  const suffix = unit ? ` ${unit}` : "";
  return {
    kind: "stepped",
    classes: folded.map((run, index) => {
      const colour = composite(run.colour);
      return {
        value: run.low,
        label: index % every === 0 ? label(run.low) : null,
        title: `${label(run.low)} – ${label(run.high)}${suffix}`,
        colour: css(colour),
        textColour: textOn(colour),
      };
    }),
  };
}

/** The gradient over `low`–`high`, with a few of the stops named along it. */
function continuousLegend(stops: PaletteStop[], low: number, high: number): Legend | null {
  // A range of a single value would divide by zero and stack every label on
  // one point; a classification has no such span to divide by, which is why
  // this guard belongs to the ramp alone.
  if (!(low < high)) return null;

  const at = (value: number) => ((value - low) / (high - low)) * 100;
  const gradient = `linear-gradient(to right, ${stops
    .map((stop) => {
      const [red, green, blue, alpha] = rgba(stop);
      return `rgba(${red},${green},${blue},${alpha / 255}) ${at(stop[0]).toFixed(1)}%`;
    })
    .join(", ")})`;

  const values = stops.map(([value]) => value);
  const every = Math.max(1, Math.round((stops.length - 1) / (TICKS - 1)));
  const ticks = values
    .filter((_, index) => index % every === 0 || index === stops.length - 1)
    .map((value) => ({
      value,
      label: label(value),
      at: at(value),
      textColour: textOn(composite(sample(stops, value))),
    }));

  return { kind: "continuous", gradient, ticks };
}

/**
 * The legend for a palette over `min`–`max`, or `null` when there is nothing to
 * draw: no stops, or a ramp whose range collapsed to a single value.
 */
export function legendBar(
  palette: PaletteStop[] | null | undefined,
  min?: number | null,
  max?: number | null,
  unit = "",
): Legend | null {
  if (!palette || palette.length === 0) return null;
  const stops = sorted(palette);
  const classes = classification(runs(stops));
  if (classes) return steppedLegend(classes, unit);

  const values = stops.map(([value]) => value);
  const low = typeof min === "number" ? min : Math.min(...values);
  const high = typeof max === "number" ? max : Math.max(...values);
  return continuousLegend(stops, low, high);
}
