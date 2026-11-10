/**
 * The Weather layer in the rail: always first when any source can draw it, and
 * otherwise absent.
 *
 * It is not a quantity — it has no variable and no colour scale — but it is
 * *shaped* as one here, so the rail and the model picker reason about it with
 * the rules they already have (`selection.ts`): its sources are the ones that
 * name a symbols model, and switching in or out keeps the model where both
 * sides have it.
 */

import type { Catalogue, Quantity, Source } from "../api/types";
import { initialSelection, type Selection } from "./selection";

/** Weather's slug in a selection: a colon, so no operator's quantity slug can be it. */
export const WEATHER = ":weather";

export const WEATHER_ICON = "cloud-sun";

export function isWeather(slug: string | undefined | null): boolean {
  return slug === WEATHER;
}

/**
 * Weather's sources as the selection rules see them. They carry no variable and
 * no render token: nothing in Weather draws a texture.
 */
function weatherQuantity(catalogue: Catalogue): Quantity | null {
  const sources: Source[] = catalogue.weather.sources.map((s) => ({ ...s, version: "" }));
  if (sources.length === 0) return null;
  return { slug: WEATHER, name: catalogue.weather.label, kind: "weather", icon: WEATHER_ICON, decimals: 0, sources };
}

/** What the rail offers: Weather first when it can be drawn, then the scalar quantities. */
export function railView(catalogue: Catalogue): Catalogue {
  const weather = weatherQuantity(catalogue);
  const scalars = catalogue.quantities.filter((q) => q.kind === "scalar");
  return { ...catalogue, quantities: weather ? [weather, ...scalars] : scalars };
}

/** The selection the viewer opens on: Weather when the operator asks and it is there, else the first quantity. */
export function openingSelection(view: Catalogue, opens: boolean): Selection | null {
  const rest = { ...view, quantities: view.quantities.filter((q) => !isWeather(q.slug)) };
  if (opens && isWeather(view.quantities[0]?.slug)) return initialSelection(view);
  return initialSelection(rest) ?? initialSelection(view);
}

/**
 * The step of `times` nearest `time`, so a switch between Weather and a raster
 * keeps the moment on screen. The earlier wins a tie; with nothing to carry,
 * the first step.
 */
export function nearestStep(times: string[], time: string | null): number {
  if (!time || times.length === 0) return 0;
  const wanted = Date.parse(time);
  let best = 0;
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(Date.parse(times[i]) - wanted) < Math.abs(Date.parse(times[best]) - wanted)) best = i;
  }
  return best;
}
