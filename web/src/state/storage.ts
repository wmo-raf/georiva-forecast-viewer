/**
 * The browser's `localStorage`, or none.
 *
 * Reading `localStorage` itself can throw (blocked site data, some private
 * windows), so every remembered setting goes through here and treats `null`
 * as "nothing to remember with".
 */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
