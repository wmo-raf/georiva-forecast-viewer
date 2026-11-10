/**
 * Settings the viewer remembers between visits, in `localStorage`.
 *
 * Storage is a convenience and nothing more: reading `localStorage` itself can
 * throw (blocked site data, some private windows), a stored value can be
 * garbage or written by an older version, and a write can be refused. Every
 * one of those falls back — to the caller's `sanitize` of nothing, or to
 * holding the setting for this visit only — rather than reaching the map as
 * something it cannot draw.
 */

/** The browser's `localStorage`, or none. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** What was stored under `key`, cleaned by `sanitize`; `sanitize(null)` when nothing usable was. */
export function loadRemembered<T>(key: string, sanitize: (raw: unknown) => T, storage = browserStorage()): T {
  try {
    const stored = storage?.getItem(key);
    return sanitize(stored ? JSON.parse(stored) : null);
  } catch {
    return sanitize(null);
  }
}

export function saveRemembered(key: string, value: unknown, storage = browserStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Full, blocked or private: the setting still holds for this visit.
  }
}
