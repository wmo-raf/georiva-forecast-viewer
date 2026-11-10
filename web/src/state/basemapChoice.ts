/**
 * Which basemap is under the map, per kind of layer, remembered between visits.
 *
 * Each kind opens on the ground it reads best on: Weather's symbols on light,
 * the value rasters and white wind trails on grey. A user's pick from the
 * toolbar is kept for the kind they made it in, so preferring light under
 * temperature does not also flip their Weather, and the reverse.
 */

import type { BasemapName } from "../map/basemap";
import { browserStorage, loadRemembered, saveRemembered } from "./storage";

export interface BasemapChoice {
  weather: BasemapName;
  raster: BasemapName;
}

export const DEFAULT_BASEMAPS: Readonly<BasemapChoice> = Object.freeze({ weather: "light", raster: "grey" });

export const STORAGE_KEY = "georiva-forecast-viewer:basemap";

const NAMES: readonly BasemapName[] = ["grey", "light"];

const valid = (value: unknown): value is BasemapName => NAMES.includes(value as BasemapName);

/** What was stored, each kind that is not a basemap this viewer has taking its default. */
export function sanitizeBasemaps(raw: unknown): BasemapChoice {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    weather: valid(value.weather) ? value.weather : DEFAULT_BASEMAPS.weather,
    raster: valid(value.raster) ? value.raster : DEFAULT_BASEMAPS.raster,
  };
}

/** The basemap for the layer on screen. */
export function basemapFor(choice: BasemapChoice, weather: boolean): BasemapName {
  return weather ? choice.weather : choice.raster;
}

export function loadBasemaps(storage: Storage | null = browserStorage()): BasemapChoice {
  return loadRemembered(STORAGE_KEY, sanitizeBasemaps, storage);
}

export function saveBasemaps(choice: BasemapChoice, storage: Storage | null = browserStorage()): void {
  saveRemembered(STORAGE_KEY, choice, storage);
}
