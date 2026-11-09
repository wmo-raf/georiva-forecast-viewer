/**
 * How the wind is drawn, as the user set it in the toolbar's wind dropup.
 *
 * The defaults are the values tuned by eye against both models before any of
 * this was adjustable, so nothing changes for someone who never opens the
 * dropup. The settings are the viewer's one piece of remembered state: they go
 * to `localStorage` and come back on the next visit. Storage is a convenience
 * and nothing more — private windows, blocked site data and a value written by
 * an older version all fall back to the defaults, field by field, rather than
 * reaching the particle layer as something it cannot draw.
 */

/** A multiplier on the automatic particle budget (`map/particles.ts`), not a count. */
export type Density = 0.5 | 1 | 2;

export const DENSITIES: readonly { value: Density; label: string }[] = [
  { value: 0.5, label: "Sparse" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Dense" },
];

export interface WindSettings {
  on: boolean;
  /** WeatherLayers' `speedFactor`, applied relative to the zoom. */
  speed: number;
  /** Trail width, in pixels. */
  width: number;
  /** WeatherLayers' `maxAge`: a particle's life in frames, which is its trail's length. */
  life: number;
  density: Density;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

export const RANGES = {
  speed: { min: 5, max: 60, step: 1 },
  width: { min: 0.5, max: 3, step: 0.1 },
  life: { min: 10, max: 60, step: 1 },
} as const satisfies Record<string, Range>;

export const DEFAULT_WIND: Readonly<WindSettings> = Object.freeze({
  on: true,
  speed: 25,
  width: 1.4,
  life: 25,
  density: 1,
});

export const STORAGE_KEY = "georiva-forecast-viewer:wind";

function inRange(value: unknown, range: Range, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

/**
 * Settings from whatever was stored: each field that is missing, the wrong
 * type or not finite takes its default, and a number out of range is clamped
 * into it.
 */
export function sanitize(raw: unknown): WindSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    on: typeof value.on === "boolean" ? value.on : DEFAULT_WIND.on,
    speed: inRange(value.speed, RANGES.speed, DEFAULT_WIND.speed),
    width: inRange(value.width, RANGES.width, DEFAULT_WIND.width),
    life: inRange(value.life, RANGES.life, DEFAULT_WIND.life),
    density: DENSITIES.some((d) => d.value === value.density) ? (value.density as Density) : DEFAULT_WIND.density,
  };
}

/** The storage the browser offers, or none: reading `localStorage` itself can throw. */
function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadWindSettings(storage: Storage | null = browserStorage()): WindSettings {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return sanitize(stored ? JSON.parse(stored) : null);
  } catch {
    return { ...DEFAULT_WIND };
  }
}

export function saveWindSettings(settings: WindSettings, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Full, blocked or private: the settings still hold for this visit.
  }
}
