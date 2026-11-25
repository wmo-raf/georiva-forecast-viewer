/** What GeoRiva's public routes return, as far as the viewer reads them. */

/** `GET /api/forecast-viewer/` — the plugin's catalogue. */
export interface Catalogue {
  config: ViewerConfig;
  quantities: Quantity[];
  weather: WeatherLayer;
}

/**
 * The Weather layer: Yr symbols over the towns and nothing else. Not a
 * quantity — configured in the viewer's settings, and drawn by the sources
 * that name a symbols model, listed here in source order.
 */
export interface WeatherLayer {
  /** What the rail calls it: the operator's words, "Weather" by default. */
  label: string;
  /** Open the viewer on it, when any source can draw it. */
  opens: boolean;
  sources: WeatherSource[];
}

export interface WeatherSource {
  slug: string;
  name: string;
  descriptor: string;
  catalog: string;
  collection: string;
  symbols_model: string;
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

/** `weather` is the viewer's own rail entry (`state/weather.ts`), never one from the catalogue. */
export type QuantityKind = "scalar" | "vector" | "weather";

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
  /**
   * The Forti forecast model whose town forecasts this source's weather
   * symbols come from (`/api/forecast/{model}/places/`), or blank for none.
   * The operator's choice: Forti does not say which collection a model is
   * published from.
   */
  symbols_model: string;
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
  /** Isobar spacing, in the texture's unit; every line is drawn alike. */
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
  /**
   * How core renders the variable (its render contract, wmo-raf/georiva #785–#812).
   * The three the viewer draws with are optional only because a core older than
   * 0.5.0 sends none of them; `renderContractGap` says which is missing.
   */
  "x-georiva": {
    /** The served range a code decodes over. */
    image_unscale: [number, number];
    /** The default style's 256 colours, one per code: what the raster is coloured with. */
    colour_table?: ColourTable;
    /** The curve a code was encoded through, over the stored range. */
    encoding?: Encoding;
    /** The default style laid out along a 0–1 bar. */
    legend?: ServerLegend;
  };
}

export type Rgba = [number, number, number, number];

/** 256 `[r, g, b, a]`, the colour of each code. */
export type ColourTable = Rgba[];

export interface Encoding {
  curve: "linear" | "sqrt" | "log";
  /** The stored range the codes were encoded over: a `log` code's fraction depends on it. */
  range: [number, number];
}

/** What lies beyond an end of the style: its end colour, or nothing. */
export type OutOfRange = "clamp" | "transparent";

/** Core's `machine_plane/legend.py`: where each colour and value sits along the bar. */
export interface ServerLegend {
  /** `[position 0–1, [r, g, b, a]]`, in order. */
  gradient: [number, Rgba][];
  /** `[position 0–1, value served]`, in order. */
  ticks: [number, number][];
  /** Which ticks carry their value as text: the server's pick, never added to. */
  labels?: number[];
  /** Equal-width bands, whose labels may thin further where the bar is narrow. */
  stepped?: boolean;
  under: OutOfRange;
  over: OutOfRange;
}

/** `[value, [r, g, b]]` or `[value, [r, g, b, a]]`, as WeatherLayers takes it. */
export type PaletteStop = [number, [number, number, number] | [number, number, number, number]];

/** One town of `GET /api/forecast/{model}/places/`, most prominent first. */
export interface PlacesTown {
  id: number;
  name: string;
  /** 1 capital, 2 admin-1 seat, 3 admin-2 seat, 4 town. */
  rank: number;
  population: number;
  coordinates: [number, number];
}

/**
 * `GET /api/forecast/{model}/places/`: a model's latest run told for its towns,
 * every value as `values[field][town][time]` over `times`.
 *
 * Instants (`air_temperature`, `wind_*`) are read at a time; `symbol_code` and
 * `precipitation_amount` cover the window that starts there.
 */
export interface PlacesMatrix {
  model: string;
  reference_time: string;
  /** The area the towns were chosen from: west, south, east, north. */
  bbox: [number, number, number, number];
  window: { duration: string };
  times: string[];
  units: Record<string, string>;
  towns: PlacesTown[];
  values: {
    symbol_code: (string | null)[][];
    air_temperature: (number | null)[][];
    wind_speed: (number | null)[][];
    wind_from_direction: (number | null)[][];
    precipitation_amount: (number | null)[][];
  };
}
