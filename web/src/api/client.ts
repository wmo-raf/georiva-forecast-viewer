/** The viewer's reads of GeoRiva, over public HTTP routes only (ADR 0036). */

import { catalogueUrl, edrCollectionUrl, placesUrl, runsUrl } from "./addresses";
import type { Catalogue, EdrCollection, PlacesMatrix, RunsResponse, Source } from "./types";

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`${status} from ${url}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new HttpError(url, response.status);
  return (await response.json()) as T;
}

export const loadCatalogue = () => getJson<Catalogue>(catalogueUrl());
export const loadRuns = (source: Source) => getJson<RunsResponse>(runsUrl(source));
export const loadEdr = (source: Source) => getJson<EdrCollection>(edrCollectionUrl(source));

/** How often a 503 from the places route is retried: it means "being prepared", which takes seconds. */
const PLACES_ATTEMPTS = 6;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A model's town forecasts. The route answers 503 with a `Retry-After` while
 * the reader is still loading a new run, or another request is building the
 * same matrix; both clear within seconds, so a few retries are waited out here
 * rather than shown as a failure.
 */
export async function loadPlaces(model: string): Promise<PlacesMatrix> {
  const url = placesUrl(model);
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.ok) return (await response.json()) as PlacesMatrix;
    if (response.status !== 503 || attempt >= PLACES_ATTEMPTS) throw new HttpError(url, response.status);
    const seconds = Number(response.headers.get("Retry-After"));
    await wait((Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000);
  }
}
