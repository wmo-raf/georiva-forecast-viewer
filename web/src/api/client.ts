/** The viewer's reads of GeoRiva, over public HTTP routes only (ADR 0036). */

import { catalogueUrl, edrCollectionUrl, runsUrl } from "./addresses";
import type { Catalogue, EdrCollection, RunsResponse, Source } from "./types";

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
