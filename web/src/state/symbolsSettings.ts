/**
 * Whether the weather symbols are switched on, remembered between visits like
 * the wind's and the pressure overlay's settings.
 *
 * On by default: the symbol map is the most readable view of a forecast for
 * somebody who is not a forecaster, and it is drawn only where the selected
 * source has a symbols model and its run is the one the symbols were built from.
 */

import { browserStorage, loadRemembered, saveRemembered } from "./storage";

export interface SymbolsSettings {
  on: boolean;
}

export const DEFAULT_SYMBOLS: Readonly<SymbolsSettings> = Object.freeze({ on: true });

export const STORAGE_KEY = "georiva-forecast-viewer:symbols";

export function sanitizeSymbols(raw: unknown): SymbolsSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { on: typeof value.on === "boolean" ? value.on : DEFAULT_SYMBOLS.on };
}

export function loadSymbolsSettings(storage: Storage | null = browserStorage()): SymbolsSettings {
  return loadRemembered(STORAGE_KEY, sanitizeSymbols, storage);
}

export function saveSymbolsSettings(settings: SymbolsSettings, storage: Storage | null = browserStorage()): void {
  saveRemembered(STORAGE_KEY, settings, storage);
}
