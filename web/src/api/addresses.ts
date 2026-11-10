/**
 * Every address the viewer asks GeoRiva for, in one place.
 *
 * All relative to the page's own origin: the bundle is served from the same
 * host as the API, and that host is what names the organisation. The tile
 * routes carry the organisation in the path (core's ADR 0013), which the
 * catalogue's config supplies.
 */

import type { Source } from "./types";

export function catalogueUrl(): string {
  return "/api/forecast-viewer/";
}

/** The route's own maximum; its default of 20 would hide older complete runs. */
const RUNS_LIMIT = 200;

export function runsUrl(source: Source): string {
  return `/api/runs/${source.catalog}/${source.collection}/?limit=${RUNS_LIMIT}`;
}

/** A Forti model's whole latest run, told for its towns. */
export function placesUrl(model: string): string {
  return `/api/forecast/${encodeURIComponent(model)}/places/`;
}

export function edrCollectionUrl(source: Source): string {
  return `/api/edr/collections/${source.collection}/`;
}

/**
 * What every texture URL carries beyond its path: which step, and the token
 * that keys the reply.
 *
 * In one place because the two are a pair. A texture reply is immutable for a
 * year, so a URL that named a step without its render-config token would be
 * cached against a range it no longer matches (ADR 0021) — and the two
 * addresses below must never drift on that. `leading` goes first so each
 * address keeps the parameter order core's `addresses.py` writes.
 */
function stepParams(
  version: string,
  time: string,
  reftime: string | null,
  leading: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams({ ...leading, time });
  if (reftime) params.set("reftime", reftime);
  params.set("v", version);
  return params;
}

/**
 * The value-encoded texture of one variable at one step (ADR 0021), carrying a
 * render-config token as `v=` so the immutable reply is keyed by render config.
 *
 * The token is the source listing's by default, which is the token of the
 * variable that listing is for. A *different* variable of the same source —
 * the pressure overlay's, drawn over whichever raster is selected — passes
 * its own, or its texture would be cached against another variable's range.
 */
export function encodedPreviewUrl(
  org: string,
  source: Source,
  variable: string,
  time: string,
  reftime: string | null,
  version: string = source.version,
): string {
  const params = stepParams(version, time, reftime);
  return `/titiler/${org}/${source.catalog}/${source.collection}/${variable}/encoded-preview.png?${params}`;
}

/**
 * The two-band (u, v) texture of one step, for the particle layer (core's #593).
 *
 * Addressed on the *collection*, with the pair named in the query, because the
 * nginx gate decides visibility per collection and one decision has to cover
 * both components (ADR 0021's amendment). `version` is the pair's own token,
 * which the plugin mints from both ranges: the two bands are encoded over the
 * union of them, so an edit to either moves every pixel of both.
 */
export function vectorPreviewUrl(org: string, source: Source, time: string, reftime: string | null): string {
  if (!source.u || !source.v) {
    throw new Error(`${source.slug} has no u and v pair to build a vector texture from`);
  }
  const params = stepParams(source.version, time, reftime, { u_variable: source.u, v_variable: source.v });
  return `/titiler/${org}/${source.catalog}/${source.collection}/vector-preview.png?${params}`;
}
