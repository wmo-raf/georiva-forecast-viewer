# The PRD's done-when list, walked

wmo-raf/georiva#594 ends with seven "done when" items. Issue
wmo-raf/georiva-forecast-viewer#6 asks for them to be walked against a running
GeoRiva rather than argued from the code, and for every core gap found to be
filed in core instead of worked around here. This is the record of that walk.

## What it was walked against

A GeoRiva dev stack (`just up`) on `127.0.0.1.sslip.io`, organisation
`central`, with this repo bind-mounted under `dev-plugins/` and the web bundle
built (`cd web && npm run build`) and collected (`georiva collectstatic`), so
the browser was served the same `static/forecast_viewer/` tree a release tag
ships. Two forecast collections held real data:

| source | collection | visibility | domain |
|---|---|---|---|
| ECMWF IFS | `ecmwf-ifs/ecmwf-ifs-surface` | public | global |
| KMD NWP | `kmd-nwp/kmd-nwp-surface` | public | Kenya, 3 km |

`ecmwf-aifs/ecmwf-aifs-surface` is `private` and was used for the visibility
items.

## Result

Six of the seven items hold outright. Item 1 holds in its "shows IFS and WRF"
half only: the install it names was not performed, for the reason below. Three
core gaps were found and filed — wmo-raf/georiva#600, #601 and #602.

**Not covered:** a genuinely fresh install — `plugins.toml` → clone at a tag →
`pip install` → `collectstatic` → nginx — was not run end to end, because doing
it on this machine means destroying the dev stack's ingested data. The
installer's manifest parsing was exercised directly (item 1 below), and the
release workflow already rehearses clone-and-`collectstatic` before it pushes a
tag. The remaining untested step is a first `up` on an empty volume.

## 1. A fresh install with the plugin and frontend deployed shows IFS and WRF

**Partly: the viewer shows both models, but not from a fresh install.** The
"shows IFS and WRF" half is checked; the "fresh install" half is the gap named
above, and this item stays open until someone runs it on an empty volume. One
documentation bug was found and fixed on the way.

The viewer loads at `/static/forecast_viewer/index.html`, lists both models in
the model panel, and draws each: IFS over the globe, KMD NWP clipped to its
regional domain, each with its own palette, legend span and day strip. Every
GeoRiva request in the cold-load network log answered 200, and every one of
them is a public route (item 2).

The bug: this README documented the manifest entry as `[[plugin]]`. Core's
`deploy/plugins/parse_plugins_toml.py` reads the `plugins` key and nothing
else, so a site following the README gets a manifest that parses cleanly,
installs nothing and exits 0:

```
$ python3 parse_plugins_toml.py readme-spelling.toml   # [[plugin]]
(no output)                                            # exit 0
$ python3 parse_plugins_toml.py correct-spelling.toml  # [[plugins]]
--git https://github.com/wmo-raf/georiva-forecast-viewer.git#v0.1.0
```

Fixed in the README, with the silence spelled out, since the symptom is a
viewer that never appears and no error anywhere that says why.

The *spelling* was the README's fault, but the *silence* is core's: a manifest
containing no `plugins` table at all is a manifest that cannot do what it was
written for, and `parse_plugins_toml.py` answers it with `sys.exit(0)` and no
output. A warning there would have turned this from a mystery into one line of
install log. Filed as wmo-raf/georiva#602; see item 7.

## 2. `web/` uses only public HTTP routes, with no private routes or workarounds

**Yes.** Every GeoRiva address the bundle builds lives in `src/api/addresses.ts`
— five of them, all public, all relative to the page's own origin:

```
/api/forecast-viewer/                                             this plugin's catalogue
/api/runs/<catalog>/<collection>/?limit=200                       core #592
/api/edr/collections/<collection>/                                core EDR
/titiler/<org>/<cat>/<coll>/<var>/encoded-preview.png             core ADR 0021
/titiler/<org>/<cat>/<coll>/vector-preview.png?u_variable=…       core #593
```

`grep -rE "https?://|/api/|/titiler/|/martin/" src/` outside the tests finds
exactly those five plus one more string: the built-in default basemap style URL
in `MapView.vue`, which an organisation replaces in the admin. The two `fetch`
calls in the bundle (`api/client.ts`, `map/texture.ts`) are both handed a URL
that `addresses.ts` built — neither assembles one of its own.

The network log of a cold load confirms it: those four and nothing else on the
GeoRiva host, beside the basemap's own traffic to `basemaps.cartocdn.com` —
style, sprites, glyphs and tiles — which comes from the built-in default style
URL and is replaceable per organisation in the admin. Nothing reaches `/admin/`, nothing
carries a session assumption, and the one value the web may not spell — core's
render-config token — is minted server-side by the plugin and handed over as
`version`.

## 3. An operator can add a model in the admin and it appears with no redeploy

**Yes.** A `ForecastSource` and its binding were created against the running
stack and the catalogue route answered with the new source on the very next
request, from the same gunicorn process; deleting the row removed it again just
as immediately. The route recomputes per request and is `Cache-Control:
no-store`, so there is no layer that could hold a stale answer.

The admin half — that this is reachable and correct through the admin forms,
including the same-collection and same-organisation refusals — is covered by
`tests/test_admin.py` (`test_a_source_is_created_with_its_bindings_in_one_post`
and the source-admin tests beside it).

## 4. A new run appears in the viewer without any operator action

**Yes.** Nothing an operator writes mentions a run: a binding names a
*variable*, and the run comes from `/api/runs/` and EDR at load time. Live, the
IFS source row is static while its collection holds 33 runs, and the viewer
opened on `2026-11-03T12:00Z` — the newest complete one — with nobody touching
the admin.

One honest limit, narrower than it first looks. `store.ts`'s watcher reloads
runs and EDR whenever the selected source differs from `state.timelineFor`,
which holds only the last source loaded — so switching model away and back does
refetch, and a new run turns up then. The stuck case is the single-model tab:
left open on one model and never touched, it keeps the run it opened on until
the page is reloaded. There is no polling. "Without any operator action" holds;
"without the user doing anything at all" is not what the PRD asked for and is
not implemented.

## 5. A model on a private collection isn't listed or served to an anonymous caller

**Yes, both halves.**

*Not listed.* A source was bound to the private `ecmwf-aifs-surface`
collection. The anonymous catalogue did not mention it; the same request with a
member's API key listed it under `t2m`. It is absent rather than forbidden, so
the listing cannot be used to enumerate what a tenant keeps private.
`tests/test_catalogue.py` holds the rule for all three tiers.

*Not served.* Anonymously, against the private collection:

| route | status |
|---|---|
| `/api/edr/collections/ecmwf-aifs-surface/` | 404 |
| `/api/runs/ecmwf-aifs/ecmwf-aifs-surface/` | 404 |
| `/api/tile-config/central/…/2t/` | 404 |
| `/titiler/central/ecmwf-aifs/…/encoded-preview.png` | 404 |

With a member's key the first two become 200. `tile-config` stays 404 for
everyone by design, and is not a gap: core documents it as `public`-only
because Titiler's onward call carries no credential, and a private variable
renders from the palette cache Django warms directly
(`core/machine_plane/config_view.py`). The viewer never calls it.

## 6. Wind particles animate correctly for both IFS and WRF

**Yes.** Checked against the source data in `docs/wind-direction-check.md`
(2026-11-04): both models' components agree with their COGs within one
quantisation step, with no band swapped and no axis flipped. Bearings agree to
within what 8-bit encoding over the configured range allows — 1.5° for WRF's
`[-20, 10]`, up to 11° for IFS's much wider `[-80, 80]` in near-calm air. That
is the cost of the operator's range setting, not a convention error, and that
doc says so. Confirmed again on
screen in this walk — IFS showing the north-easterly flow over the Horn and the
south-easterlies over the Indian Ocean, KMD NWP showing easterlies over Kenya
and drawing only inside its regional domain.

## 7. Every gap found in core is filed as an issue, not worked around here

**Three gaps filed: wmo-raf/georiva#600, #601 and #602.**

### wmo-raf/georiva#600 — EDR's `x-georiva.runs` is unbounded

`GET /api/edr/collections/<slug>/` embeds one entry per reference time, each
carrying every valid time in that run, built from an unlimited `values_list`
over every item row in the collection. The flat `extent.temporal.values` beside
it was deliberately bounded to the latest run; this list never got the same
treatment, and both the query and the body grow as runs × lead times.

Retention hides it on this stack — `retain_past_forecasts` is off, so
`ecmwf-ifs-surface` yields 2 runs and 9 valid times (393 B of an 11 kB
document) and `kmd-nwp-surface` 2 runs and 96 valid times (2.9 kB of 12 kB). A
site that keeps its past forecasts gets the other shape: WRF at 48 lead times,
four runs a day for a month, is ~5,800 entries re-fetched on every model
switch.

The viewer cannot work around it. It needs one run's valid times; `/api/runs/`
knows which runs exist and which are complete but carries no valid times, so
`timeline.ts` joins the two on reference time and downloads every run's lead
times to use one run's. Capping it client-side is not possible — the server
decides what to send.

### wmo-raf/georiva#601 — a plugin cannot contribute a page route

The second candidate named in #6, and it was hit. ADR 0028 confines a plugin to
`/api/`, so this app's only address is
`/static/forecast_viewer/index.html`: a path that names the build output rather
than the application, and gives an operator no way to put the viewer where
their users would look for it. The viewer has no client-side routing today, so
nothing is broken by it yet; the cost is that there is nowhere to put the app
and no path for unknown sub-paths to fall back to, which any shareable URL
would need. The bundle-in-static trick answers ADR 0036's open deployment
question and nothing else.

Neither was worked around here.

### wmo-raf/georiva#602 — the installer's silent no-op

Raised in item 1: a `plugins.toml` with no `plugins` table installs nothing and
exits 0 with no output. Core's parser is right about which key it reads; it is
wrong to say nothing when a manifest asks for nothing. Smaller than the two
above, and a one-line `WARNING` on the `stderr` channel the parser already uses
for `SKIP` and for the no-source warning would close it.

## Since this walk — 2026-11-05, the basemap

The external-traffic finding above was true when it was made and is left
standing as the record of that walk. It no longer describes the viewer.

The built-in default basemap style URL it names — the one string in `src/`
besides the five GeoRiva routes, pointing at `basemaps.cartocdn.com` — is gone,
and with it the `basemap_style_url` setting that let an organisation replace
it. The viewer now carries one style of its own in `web/src/map/basemap.ts`,
bundled into the app rather than fetched, so a cold load makes **no style
request at all**. The external host is now `tiles.openfreemap.org`, for tiles
and glyphs only; no sprite is fetched, because nothing in the style draws an
icon. Re-run the audit's `grep` and the five GeoRiva routes now stand alone,
with the OpenFreeMap URLs reachable only through that one module.

Two things the walk's reasoning still holds for: the bundle assembles no URL of
its own outside `addresses.ts`, and nothing the basemap touches carries a
credential or a session assumption — the OpenFreeMap source is declared by its
TileJSON URL, which is also where its attribution comes from.

## Since this walk — 2026-11-05, a second external host, borrowed

The basemap note above said the bundle reaches `tiles.openfreemap.org` and
nothing else. That is no longer true, and the exception is deliberate but
temporary.

The shore's shadow — the soft band in the water along every coast — is served
as pre-rendered raster tiles from
`storage.googleapis.com/map-borders-tiles/borders_in/{z}/{x}/{y}.png`: black at
nine alpha steps over transparency, z0–z8. MapLibre cannot draw this effect
itself; the vector attempt pushed a blurred line off the shore with
`line-offset`, which folds the geometry wherever the offset outruns the spacing
between vertices, and on Lake Victoria's shoreline that is everywhere.

Three things an operator or reviewer should know about that host:

- **It is not ours and it is not licensed.** The bucket is anonymously
  readable, but its metadata and listing are not, so there is no discoverable
  licence, no terms and no identifiable owner. Every tile a user loads bills a
  stranger's egress, with no SLA and no undertaking that it will still be there
  tomorrow. It was last modified in March 2026.
- **It bakes in somebody else's international boundaries.** The tiles are not
  only a shadow: an inland tile over DRC with no coast in it is still 18,718
  non-transparent pixels. The style therefore continues to draw its own
  coastline and borders over the top, so that the lines GeoRiva *asserts* are
  the ones whose filters live in this repository — maritime excluded, disputed
  dashed, `claimed_by` dropped. `basemap.test.ts` pins those layers against
  being deleted as redundant. What this does **not** do is stop the borrowed
  tiles drawing boundaries of their own underneath, including ones our filters
  exist to exclude.
- **It is meant to be replaced**, by tiles rendered and hosted by us from
  Natural Earth coastlines: wmo-raf/georiva-forecast-viewer#15.
