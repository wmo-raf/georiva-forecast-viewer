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
├── docs/                          # notes on checks that need a running stack
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
  Scalar (one variable) or vector (a u/v pair), with an icon from the curated
  set in `icons.json`. Per organisation.
- **Source** — one model the viewer can show: one collection, with a name, a
  short descriptor ("9 km") and an order. Owned through its collection.
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

The web half lives in `web/` and has its own README: `npm run dev` there serves
it against the local stack, proxied under one organisation's host.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on main:

| Job | What it runs |
|---|---|
| Lint (ruff) | `make lint` — the same pinned ruff `make format` applies |
| Web | `npm ci`, then `lint` (eslint), `typecheck` (vue-tsc), `test` (vitest) and `build` |
| Plugin tests | the Django suite, inside the published core image |

The plugin suite runs against `ghcr.io/wmo-raf/georiva:main` — the image
servers run — with the repo bind-mounted where core discovers plugins, so no
part of core is rebuilt here. Tracking `main` means a core change that breaks
this plugin shows up on the next pull request rather than on a server; when
that happens the fix belongs in core, and the `GEORIVA_IMAGE` value at the top
of the workflow is pinned to a release tag only to keep a branch alive for an
older core.

The web bundle is built on every pull request and thrown away. Only a release
commits it.

## Releasing

The installer (core's ADR 0035) does `git clone --depth 1 --branch <tag>`, runs
no hooks and has no node: **whatever is committed at the tag is what a server
gets**, so the built bundle has to be in the tree the tag points at. It is not
on main, where a minified bundle would make every diff unreadable. Each tag is
main's tip plus one commit holding the bundle:

```
main:  … ── A ── B (tip)
                   ╲
                    C ← v0.2.0   (B's tree + static/forecast_viewer/)
```

To cut a release:

1. On a branch, bump the version in **both** `pyproject.toml` and
   `georiva_plugin_info.json`, and merge it to main. The release workflow
   checks the two against the tag and refuses a release where they disagree —
   the version is a reviewed commit, not something CI writes on its way past.
2. Run the **Release** workflow from the Actions tab (`workflow_dispatch`) with
   the version, including the `v` — `v0.2.0`. It only runs from main.

It refuses to start unless CI is green for the commit it would release, re-runs
the web checks, builds the bundle, commits it to a detached commit on main's
tip, and then — before pushing anything — clones its own local tag the way the
installer would and runs `collectstatic` in the core image, failing if
`/static/forecast_viewer/index.html` does not come out of it. Only then is the
tag pushed and a GitHub release opened with the manifest entry below. A tag is
never moved or rebuilt: to fix a bad release, bump the version and cut another
one, because a server pins a tag and is entitled to have it keep meaning one
tree.

It releases **main's tip at the moment you dispatch it**, which is not
necessarily the commit that bumped the version — anything merged in between
ships too. The release notes name the exact source commit for that reason.

A site installs it through `deploy/plugins.toml`:

```toml
[[plugin]]
name = "georiva-forecast-viewer"
git = "https://github.com/wmo-raf/georiva-forecast-viewer.git"
tag = "v0.2.0"
```

`collectstatic` then collects `static/forecast_viewer/` from the installed app
and nginx serves the viewer from `/static/forecast_viewer/`.

Building locally is how you check the bundle before releasing it
(`cd web && npm run build`); the output is gitignored, so there is nothing to
undo afterwards and no way to commit it to main by accident.
