# web/

The user interface: Vite + Vue 3 + TypeScript, MapLibre GL, deck.gl + WeatherLayers GL.
It talks to GeoRiva over public HTTP routes only (core's ADR 0036) and is built
into `../src/georiva_forecast_viewer/static/forecast_viewer/` on release, where
`collectstatic` picks it up and nginx serves it at `/static/forecast_viewer/`.

## What it reads

| Need | Route |
|---|---|
| Quantities, sources, map config | `GET /api/forecast-viewer/` (the plugin) |
| Which runs are complete, which is latest | `GET /api/runs/<catalog>/<collection>/` |
| Each run's valid times, palette, unit, unscale range | `GET /api/edr/collections/<collection>/` |
| One step's value-encoded texture | `GET /titiler/<org>/<catalog>/<collection>/<variable>/encoded-preview.png?time=&reftime=` |
| One step's wind pair, as two bands | `GET /titiler/<org>/<catalog>/<collection>/vector-preview.png?u_variable=&v_variable=&time=&reftime=` |

The quantity is the primary selection; the source list is the sources bound to
it (`src/state/selection.ts`). Only complete runs are offered, latest first
(`src/state/timeline.ts`). Textures load lazily per step; playback waits for
the current frame before advancing. The texture's own `X-Image-Bounds` and
`X-Image-Unscale` headers are what the layer is drawn with, since display
clipping (ADR 0038) can crop the image narrower than the collection's extent.

## Wind

The scalar raster and the wind particles are a fixed pair: the same model, run
and step, from two textures loaded independently (`MapView.vue`). A step counts
as drawn only when both have settled, so playback never runs ahead of the wind.

The wind texture is two bands over one shared range, so the decoded `atan2` is
the direction in the source data. That is checked against the COGs rather than
by eye — a mirrored or transposed field still looks like weather — and the
result is recorded in [`../docs/wind-direction-check.md`](../docs/wind-direction-check.md),
with the script that produces it beside it. The note also says what the
components' configured range costs in direction precision, which is the one
thing an operator can get wrong here.

`map/particles.ts` sizes the particle budget, which is where a regional model
differs from a global one: WeatherLayers seeds particles across the *viewport*
and discards every one outside the layer's bounds, so a WRF domain covering a
tenth of the view would draw a tenth of the particles IFS does. The budget is
scaled by the share of the view the data covers, in powers of two so that
panning does not reallocate the layer's buffers and restart every trail. The
boost is capped, which bites only on a world view of a small domain — where a
trail is already several times the domain's width and the particles read as
dense regardless.

## Layout

- Left rail (`Rail.vue`): the organisation's name, the scalar quantities with
  their icons (`ui/icons.ts`, the web's half of the plugin's `icons.json`),
  and the wind toggle — which is off and disabled for a model with no wind
  binding.
- "Select model" (`ModelPanel.vue`), bottom right: the models bound to the
  selected quantity, each with its descriptor, and the run inside the same
  panel.
- Day strip (`DayStrip.vue`, `state/daystrip.ts`): one cell per UTC day of
  the run, the playhead at the step's hour of day, a floating label with the
  exact step, play and step buttons.
- Legend (`Legend.vue`, `ui/legend.ts`): the palette as a bar with stop values
  and the unit, placed over the `palette_min`/`palette_max` span EDR gives for
  display — which is deliberately not the texture's encoding range.
There is no hover readout. One was built and taken out again; what it was
built on is still here, and the next section says why.

## Reading a value at a point

`map/sample.ts` and `map/wind.ts` can say what the data is at a place, and
nothing in the UI calls them. That is deliberate rather than an oversight: the
hover readout they were written for is deferred (issue #4), with no verdict on
the idea — the panel simply carried too much for one number, and a second
attempt should show the value and its unit and leave the model and step to the
rest of the screen.

They are kept because the capability costs nothing to hold and is awkward to
rebuild. A value at a point needs no request of its own: the pixels were
fetched to draw the frame and they carry values rather than colours (ADR 0021),
so `sample.ts` takes the nearest pixel of the texture already on screen and
unscales it with the same expression the layer's shader uses — which is what
makes a number agree with the colour drawn over it. `wind.ts` turns a u/v pair
into a speed and a bearing in the convention `docs/wind-direction-check.md`
checked against both models' source data: degrees clockwise from north, naming
where the wind comes from.

Two things any caller has to handle. Alpha below full means the texture has no
value there — a nodata cell, outside a regional domain, outside a display clip
(ADR 0038) — and a sample cannot tell that from a texture that has not loaded,
so a UI showing a reading has to say which of the two it means. And a texture
pixel is 8 bits, so the value is quantised: one step is the variable's
configured range over 255, half a degree for a −60…60 °C range, with the wind's
own cost worked through in `docs/wind-direction-check.md`. The decode lands on
the bottom of a pixel's step, as the shader does, which is what keeps it
consistent with the colour it would be explaining.

## Development

```
npm install
npm run dev        # http://localhost:5173/static/forecast_viewer/
npm test           # vitest, the pure modules
npm run typecheck  # vue-tsc
npm run lint       # eslint; --fix with `npm run lint:fix`
npm run build      # into the plugin's static folder
```

CI runs all four on every pull request (`../.github/workflows/ci.yml`), so
`npm ci && npm run lint && npm run typecheck && npm test` is the whole gate.

`eslint.config.js` is deliberately thin. `vue-tsc` already holds this code to
a strict TypeScript contract, and `eslint-plugin-vue`'s recommended tiers are
mostly template formatting that no formatter here applies — so the config
takes the plugin's `essential` tier plus a few correctness rules, and `lint`
runs with `--max-warnings 0`. Nothing it reports can be ignored, which is the
point of not loading it with warnings in the first place.

`npm run build` writes into `../src/georiva_forecast_viewer/static/forecast_viewer/`,
which is gitignored: the bundle is committed once per release by the release
workflow, never by hand. See the root README.

`npm run dev` proxies `/api` and `/titiler` to the local GeoRiva stack under
one organisation's host. Copy `.env.example` to `.env` to point it at another
organisation.

## Versions that matter

- `maplibre-gl` is 6.x, with `@deck.gl/maplibre`'s `MapLibreOverlay` — not
  `@deck.gl/mapbox`'s `MapboxOverlay`, which is what pinned this to 5.x before.
  `MapboxOverlay` reads `map.transform`, which MapLibre 6 removed, and its
  interleaved layer silently never draws; `MapLibreOverlay` uses MapLibre's
  public API and declares `^4.5.1 || ^5 || ^6`. The move off 5.x was forced:
  GHSA-jrc7-96c5-q579 is a critical XSS with no 5.x patch (see below).
- MapLibre 6 is ESM-only with no default export, so the import is
  `import * as maplibregl`, and every bundler needs one `setWorkerUrl()` call —
  the worker is loaded from a real URL that Vite's module graph cannot resolve
  from `import.meta.url`.
- `weatherlayers-gl` is dual-licensed (MPL-2.0 or its own terms); the MPL
  option is what this bundle uses.

### GHSA-jrc7-96c5-q579

`DOM.sanitize()` in `maplibre-gl` skipped an attribute when stripping two
dangerous ones in a row, because it mutated a live `NamedNodeMap` while
iterating it. The surviving attribute executes when the attribution control
writes it into `innerHTML` — zero-click XSS from a style's attribution string.

That reaches this viewer: a basemap is whatever URL an operator puts in
*Forecast viewer settings*, and its attribution is rendered on every map. It
is fixed in 6.4.1 and nothing in the 5.x line was patched, which is why the
MapLibre 6 move happened as a security fix rather than on its own schedule.
