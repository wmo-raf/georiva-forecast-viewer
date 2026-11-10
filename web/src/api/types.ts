/** What GeoRiva's public routes return, as far as the viewer reads them. */

/** `GET /api/forecast-viewer/` — the plugin's catalogue. */
export interface Catalogue {
  config: ViewerConfig;
  quantities: Quantity[];
}

export interface ViewerConfig {
  org: string;
  org_name: string;
  default_view: { center: [number, number]; zoom: number };
  /**
   * Draw the shore's shadow: true only when this organisation switched it on
   * *and* the pyramid is on the server's disk. The tiles are rendered there
   * rather than shipped in this bundle, so both have to be true before the
   * style may ask for one.
   */
  shore_shadow: boolean;
}

export type QuantityKind = "scalar" | "vector";

export interface Quantity {
  slug: string;
  name: string;
  kind: QuantityKind;
  /** A name from the plugin's curated set, or blank. */
  icon: string;
  /** Decimal places for the values under place names on the map; the operator's choice, 0 by default. */
  decimals: number;
  sources: Source[];
}

/** One source as bound to one quantity: the address of its collection and the variable(s). */
export interface Source {
  slug: string;
  name: string;
  /** A short tag beside the name, e.g. "9 km"; may be blank. */
  descriptor: string;
  catalog: string;
  collection: string;
  variable?: string;
  u?: string;
  v?: string;
  /**
   * Core's render-config token for the texture URL's `v=`: the reply is
   * immutable, so a change to the variable's range or clipping must be a
   * different URL (ADR 0021). Minted by the plugin, never by the web.
   */
  version: string;
  pressure?: PressureOverlay;
}

/**
 * A source's pressure overlay: the variable drawn as isobars and highs/lows
 * over whatever raster is selected. Present on every listing of a source that
 * has one, absent otherwise.
 *
 * Unit-blind by design: `interval` is already in the texture's own unit, and
 * `to_hpa` is the one factor an H/L label needs. Both come from the server,
 * which knows the variable's stored unit; the web never converts.
 */
export interface PressureOverlay {
  variable: string;
  /** Isobar spacing, in the texture's unit; every fifth line is major. */
  interval: number;
  /** Multiply a texture value by this to get hPa. */
  to_hpa: number;
  /** The pressure variable's own render-config token: its texture's `v=`, not the source's. */
  version: string;
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
