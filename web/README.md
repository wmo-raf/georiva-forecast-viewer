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

The quantity is the primary selection; the source list is the sources bound to
it (`src/state/selection.ts`). Only complete runs are offered, latest first
(`src/state/timeline.ts`). Textures load lazily per step; playback waits for
the current frame before advancing. The texture's own `X-Image-Bounds` and
`X-Image-Unscale` headers are what the layer is drawn with, since display
clipping (ADR 0038) can crop the image narrower than the collection's extent.

## Development

```
npm install
npm run dev        # http://localhost:5173/static/forecast_viewer/
npm test           # vitest, the pure modules
npm run typecheck
npm run build      # into the plugin's static folder
```

`npm run dev` proxies `/api` and `/titiler` to the local GeoRiva stack under
one organisation's host. Copy `.env.example` to `.env` to point it at another
organisation.

## Versions that matter

- `maplibre-gl` stays on 5.x: deck.gl's interleaved overlay reads the map's
  transform, which MapLibre 6 no longer exposes, and the raster layer silently
  never draws.
- `weatherlayers-gl` is dual-licensed (MPL-2.0 or its own terms); the MPL
  option is what this bundle uses.
