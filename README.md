# georiva-forecast-viewer

The first GeoRiva app (core's ADR 0036): a forecast viewer where a user switches
between models, picks a run and steps through lead times on a full-screen map.
A met service can show its own WRF run next to global models, on its own
infrastructure. PRD: wmo-raf/georiva#594.

```
GET /api/forecast-viewer/     # the quantities and sources this caller may see, plus the map config
```

## Layout

```
georiva-forecast-viewer/
├── pyproject.toml
├── src/georiva_forecast_viewer/   # the plugin: models, admin, the catalogue route
│   └── static/forecast_viewer/    # the built web bundle, committed on release
└── web/                           # the user interface source (Vite + Vue 3 + TypeScript)
```

The repo root is the plugin, as the plugin installer requires. `web/` is built
into the plugin's static folder on release, so one install through
`deploy/plugins.toml` brings both halves: `collectstatic` collects the bundle
and nginx serves it from `/static/forecast_viewer/`. The bundle never runs in
GeoRiva's process and talks to it over public HTTP routes only.

## What the operator declares

- **Quantity** — the shared thing a user picks: "2 m temperature", "10 m wind".
  Scalar (one variable) or vector (a u/v pair). Per organisation.
- **Source** — one model the viewer can show: one collection, with a name and
  an order. Owned through its collection.
- **Binding** — which of a source's variables *is* a quantity. IFS `t2m` and
  WRF `t2` are one quantity through two bindings; IFS `10u`/`10v` and WRF
  `u10`/`v10` are one wind.
- **Settings** — basemap style and the opening view, per organisation.

Admin: *Forecast viewer → Quantities / Sources* (bindings inline on a source),
and *Settings → Forecast viewer settings*.

## What the route returns

```json
{
  "config": {"org": "kmd", "basemap_style": null, "default_view": {"center": [20.0, 0.0], "zoom": 3.0}},
  "quantities": [
    {"slug": "t2m", "name": "2 m temperature", "kind": "scalar", "sources": [
      {"slug": "ifs", "name": "ECMWF IFS", "catalog": "models", "collection": "ecmwf-ifs", "variable": "t2m"},
      {"slug": "wrf", "name": "KMD WRF", "catalog": "models", "collection": "wrf-3km", "variable": "t2"}
    ]},
    {"slug": "wind10", "name": "10 m wind", "kind": "vector", "sources": [
      {"slug": "ifs", "name": "ECMWF IFS", "catalog": "models", "collection": "ecmwf-ifs", "u": "10u", "v": "10v"}
    ]}
  ]
}
```

A source on a collection the caller may not see is absent, not forbidden
(core's ADR 0014): `public` for anyone, `private` for members of the
organisation, `internal` for nobody. A quantity with no visible source is
absent with it. Runs, lead times and render hints are not here: the web reads
them from core's `/api/runs/…` and `/api/edr/collections/…` routes.

## Development

Clone under core's `dev-plugins/` and it is bind-mounted and discovered.

```
make test      # core's `just test georiva_forecast_viewer`, inside the dev stack
make format    # ruff, pinned to core's version
make lint
```
