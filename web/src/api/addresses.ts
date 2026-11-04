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

export function runsUrl(source: Source): string {
  return `/api/runs/${source.catalog}/${source.collection}/`;
}

export function edrCollectionUrl(source: Source): string {
  return `/api/edr/collections/${source.collection}/`;
}

/** The value-encoded texture of one variable at one step (ADR 0021). */
export function encodedPreviewUrl(
  org: string,
  source: Source,
  variable: string,
  time: string,
  reftime: string | null,
): string {
  const params = new URLSearchParams({ time });
  if (reftime) params.set("reftime", reftime);
  return `/titiler/${org}/${source.catalog}/${source.collection}/${variable}/encoded-preview.png?${params}`;
}
