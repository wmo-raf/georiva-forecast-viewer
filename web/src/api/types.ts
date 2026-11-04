/** What GeoRiva's public routes return, as far as the viewer reads them. */

/** `GET /api/forecast-viewer/` — the plugin's catalogue. */
export interface Catalogue {
  config: ViewerConfig;
  quantities: Quantity[];
}

export interface ViewerConfig {
  org: string;
  basemap_style: string | null;
  default_view: { center: [number, number]; zoom: number };
}

export type QuantityKind = "scalar" | "vector";

export interface Quantity {
  slug: string;
  name: string;
  kind: QuantityKind;
  sources: Source[];
}

/** One source as bound to one quantity: the address of its collection and the variable(s). */
export interface Source {
  slug: string;
  name: string;
  catalog: string;
  collection: string;
  variable?: string;
  u?: string;
  v?: string;
}

/** `GET /api/runs/<catalog>/<collection>/` */
export interface RunsResponse {
  catalog: string;
  collection: string;
  latest_complete: Run | null;
  runs: Run[];
}

export interface Run {
  reference_time: string;
  complete: boolean;
  status: string;
  revision: number;
  version: number;
}

/** `GET /api/edr/collections/<slug>/`, the parts the viewer reads. */
export interface EdrCollection {
  extent: { spatial: { bbox: number[][] } };
  parameter_names: Record<string, EdrParameter>;
  "x-georiva": { runs?: EdrRun[] };
}

export interface EdrRun {
  reference_time: string;
  valid_times: string[];
}

export interface EdrParameter {
  label: string;
  unit?: { symbol: string };
  "x-georiva": {
    image_unscale: [number, number];
    palette?: PaletteStop[];
    palette_min?: number;
    palette_max?: number;
  };
}

/** `[value, [r, g, b]]` or `[value, [r, g, b, a]]`, as WeatherLayers takes it. */
export type PaletteStop = [number, [number, number, number] | [number, number, number, number]];
