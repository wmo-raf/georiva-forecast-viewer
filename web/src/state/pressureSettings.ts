/**
 * Which parts of the pressure overlay the user has switched on, remembered
 * between visits like the wind's settings (`windSettings.ts`).
 *
 * Two switches and nothing else: the interval is the operator's (it arrives
 * per source in the catalogue), and colour and the H/L radius are fixed by
 * the map. Both start off, so the map opens as it did before the overlay
 * existed, and a user who never turns either on never fetches its texture.
 */

import { browserStorage, loadRemembered, saveRemembered } from "./storage";

export interface PressureSettings {
  isobars: boolean;
  highLow: boolean;
}

export const DEFAULT_PRESSURE: Readonly<PressureSettings> = Object.freeze({ isobars: false, highLow: false });

export const STORAGE_KEY = "georiva-forecast-viewer:pressure";

/** Settings from whatever was stored: each field that is not a boolean takes its default. */
export function sanitizePressure(raw: unknown): PressureSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    isobars: typeof value.isobars === "boolean" ? value.isobars : DEFAULT_PRESSURE.isobars,
    highLow: typeof value.highLow === "boolean" ? value.highLow : DEFAULT_PRESSURE.highLow,
  };
}

/** Whether anything would draw from the pressure texture, which is the only reason to fetch it. */
export function pressureWanted(settings: PressureSettings): boolean {
  return settings.isobars || settings.highLow;
}

export function loadPressureSettings(storage: Storage | null = browserStorage()): PressureSettings {
  return loadRemembered(STORAGE_KEY, sanitizePressure, storage);
}

export function savePressureSettings(settings: PressureSettings, storage: Storage | null = browserStorage()): void {
  saveRemembered(STORAGE_KEY, settings, storage);
}
