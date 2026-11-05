# The shore's shadow

The soft dark band the basemap draws in the water along every shore. This is
what it is, where it comes from and how to render it again.

## Why the map has one

The viewer's basemap gives land and sea the same grey (`web/src/map/basemap.ts`
says why: a darker sea would steal contrast from exactly the water the weather
sits over, and would make one half of every palette read differently offshore
than onshore). What is left to separate them is a hairline coastline, over data
that is itself grey in half of every palette. The shadow is the cue that makes
land and sea read as different places without colouring either of them.

## Why it is a raster

MapLibre cannot draw it. The vector attempt was a blurred line pushed off the
shore with `line-offset`, which displaces each vertex along its own normal and
so turns the geometry inside out wherever the offset outruns the spacing between
vertices. Vector tiles are simplified to about a pixel per zoom, so that spacing
stays a few pixels however far you zoom in; on Lake Victoria's shoreline it
folded everywhere, each fold stacking alpha until the lake was a field of black
starbursts.

A raster has no geometry to fold:

```
dry      = rasterise(land - lakes)        # 1 on dry ground, 0 on water
distance = how far each pixel is from dry ground, in pixels
shadow   = profile(distance) * (1 - dry)  # a ramp into the water, and
                                          # exactly zero on every land pixel
```

`1 - dry` is the hard mask, not a feathered one, so the band's landward edge is
the shoreline to the pixel and cannot bleed inland. Swapping the two factors
would put the band on the land instead.

`profile` is the shape a Gaussian blur of the land mask gives across a straight
shore, which is how the issue described the algorithm — and on an ocean coast
the two are the same picture. They differ on *narrow* water. A blur sums every
shore within reach, so a body narrower than the band saturates and renders at
the darkest step throughout: at z5 that is Tanganyika, Kivu and Malawi drawn as
black slugs on a map whose job is to be quiet. Reading the profile off each
pixel's own distance to land cannot saturate, because no pixel is darker than
its own distance offshore says. This is the only place the renderer departs
from the formula in the issue, and it was a deliberate call.

There is no scipy in the image this runs in, so the distance transform is a
two-pass 5-7-11 chamfer in numpy (`_distance_to_land`): within about 2% of
Euclidean, which is half a pixel at the far end of the widest band there is and
nothing the eye can find in a nine-step ramp.

The renderer is `src/georiva_forecast_viewer/shore_shadow.py`; its tests
(`tests/test_shore_shadow.py`) hold the four things that can go wrong here
without anyone noticing — the band leaving the water, tile seams, empty tiles
being written, and the format drifting from the one that works.

## Where the tiles come from

**Natural Earth 1:10m physical**: `ne_10m_land`, `ne_10m_minor_islands` and
`ne_10m_lakes`. Public domain, so there is no attribution to carry and no
licence to honour, and it is a reference a national met service can check
against. Nothing else is used, and in particular no boundary layer of any kind:
the tiles shade water and assert nothing. The boundaries on this map are drawn
from vector tiles by filters that live in `basemap.ts` — maritime excluded,
disputed dashed, `claimed_by` dropped — and that is deliberately the only place
a border on this map can come from.

This replaced a pre-rendered pyramid borrowed from a third-party Google Cloud
Storage bucket (`storage.googleapis.com/map-borders-tiles/borders_in/…`), which
had no licence, no terms and no identifiable owner, billed a stranger's egress
for every tile every user loaded, and carried its own unaudited rendering of
international boundaries underneath ours — an inland tile over DRC with no coast
in it was still 18,718 non-transparent pixels.
See wmo-raf/georiva-forecast-viewer#15.

## What a tile is

| | |
|---|---|
| Grid | WebMercatorQuad, `{z}/{x}/{y}`, 512 px a tile |
| Extent | z0–z8, only tiles with a shore in them |
| Format | PNG, 4-bit palette, 9 alpha steps over transparency, black |
| Served from | `/static/forecast_viewer/shore-shadow/…`, rendered in place on each machine |

The step at the shore is alpha 172/255 — the borrowed tiles' 173, through one
rounding — at every zoom. That is not taste: it was measured off them, so that
taking the host back did not also silently restyle the map.

## How wide the band is, and why it depends on the zoom

| zoom | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| band, px | 4 | 4 | 4 | 7 | 11 | 16 | 20 | 25 | 25 |

Measured, not chosen. The borrowed pyramid's alpha was binned against the true
distance offshore — Natural Earth as the ruler, so the two are directly
comparable — and it came out as a ramp rather than one width.

This is the one thing the first version of this renderer got badly wrong. It
took the ~27 px read off a single z6 tile and used it at every zoom, and the
world view was unrecognisable: at z0 a 4-pixel band is 310 km of darkened
ocean and a 28-pixel band is 2,200 km, so the Atlantic went grey from Brazil to
Guinea. Neither a constant screen width nor a constant distance offshore is
what a cartographer drew here; the ramp in between is. The table flattens at
25 px from z7 because theirs does.

Everything else about the band is the same at every zoom:

- **The shore step is 172** wherever you are. Zooming out shortens the band; it
  does not lighten it. Theirs peaks at ~176 at every zoom too.
- **Nothing is darker than the shore**, anywhere, because the ramp only ever
  falls as a pixel gets further from land. A pond narrower than the band is
  water with a shadow around its edge, not a black dot.
- **Nine steps**, always. At z0 that is nine sub-pixel steps, so a coast shows
  three or four tones — which is what 4 px of gradient looks like, and what the
  borrowed tiles did there (125, 29, 5, and done).

The pyramid stops at z8, as theirs did. Natural Earth 1:10m is accurate to a
few hundred metres — about a pixel at z6, three or four by z8 — so at the
bottom of the pyramid the band's hard landward edge can sit a few pixels off
the coastline drawn over it from OpenMapTiles. That is the price of keeping the
shadow at the zoom a forecast is read at. Above z8 the style fades the layer
out rather than letting MapLibre overzoom it. `SHADOW_MAX_ZOOM` in `basemap.ts`
and `MAX_ZOOM` in `shore_shadow.py` are two halves of one number.

One thing the ramp quietly constrains: **the band may not more than double from
one zoom to the next.** The pyramid walk skips a tile when no shore comes within
its padded extent, and skips its children with it, which is only sound while a
child's padded extent lies inside its parent's. The tile halves each level, so
the band may grow by up to a factor of two and no further. `BandWidthTests`
holds the table to it.

## Why the pyramid is not in git

It is 15,088 files and 55 MB. Committing it would put that in every clone of
this repository forever, re-added wholesale on each re-render, as a diff no
reviewer can read — and then carry it again through a release tag, which the
installer clones.

It does not need to travel, because it is a pure function of two things that
*are* in git: this renderer and a public-domain dataset. So the repository
carries the recipe and each machine makes its own copy. That is the whole
trade: about seven and a half minutes of CPU, once, on each machine, against
an unreviewable binary artefact in the history of every clone.

The measured cost, four workers in the core image: **7 min 27 s**, peak RSS
**381 MB**, 15,088 tiles and 55 MB out, plus a one-off ~20 MB download. z8
alone is 9,090 of those tiles, so `--max-zoom 7` is roughly three minutes if
a box cannot spare the time.

## Rendering it, in development

In the core image, which has every library this needs (PIL, rasterio, shapely,
geopandas, numpy, morecantile) — nothing was added to the plugin for it:

```bash
just shell      # from core's checkout, this repo under dev-plugins/
python /georiva/dev-plugins/georiva-forecast-viewer/tools/build_shore_shadow.py
```

It clears `web/public/shore-shadow/` (gitignored), re-renders it, prints tiles
and bytes per zoom, and then checks the result for seams. It renders on every
core by default (`--jobs`); the walk itself stays in the parent process, since
it is one R-tree query per candidate tile and it decides which tiles exist at
all. The Natural Earth zips are cached in `.natural-earth/`, so a second run
needs no network.

`npm run dev` serves `public/` directly, and `vite build` copies it into the
bundle — so a developer who has rendered sees the shadow in both.

## Rendering it, on a server

```bash
docker compose exec georiva georiva render_shore_shadow
```

Same code, through the package rather than the script: it writes into
`<STATIC_ROOT>/forecast_viewer/shore-shadow/`, which is a writable volume
nginx already serves at the address the style asks for. Run it after
`collectstatic`. It defaults to half the cores, so the rest of the stack keeps
running, and it exits at once if a pyramid is already there (`--force` to
re-render).

Nothing runs it for you: ADR 0035 forbids install hooks, and a plugin that
executed arbitrary shell at install time is the thing that ADR refuses.

## Switching it on

The shadow is **off by default**, per organisation, in the forecast viewer's
settings. The viewer is told it is available only when the box is ticked *and*
the pyramid is on disk, so a site that has not rendered asks for no tiles and
gets no 404s; a Django system check names any organisation that has ticked the
box without rendering.

That is also the answer to "what happens on a site that never runs the
renderer": a map with a hairline coastline and no band, which is what this
basemap looked like before the shadow existed — not a broken page.

## If the map ever shows a tile seam

Every tile is rendered on an extent padded by four sigma of its own zoom's
band — which is about 1.4 times that band — and cropped back, which is what makes it pixel-identical to the same region
cut out of a render of the whole world. Remove the padding and every tile
boundary draws a visible edge, at every zoom, in the one part of the picture
that is meant to be a gradient.

Two guards, and they ask the same question of different things. `SeamTests` in
`tests/test_shore_shadow.py` holds it on synthetic geometry, in the suite. The
build script's own check — which runs after every build, or on its own with
`--verify-only` — samples tiles from the pyramid that will ship, re-renders the
2x2 block around each as a single 1024-pixel window, and requires the shipped
PNGs to equal its quarters pixel for pixel.

What neither does is compare two tiles' shared edges, and the first version of
the check made exactly that mistake: the shadow is *meant* to jump the whole
ramp at a shoreline, so wherever a coast runs along a tile boundary a
full-height step across it is the right answer. That check reported 1,880
seams in a pyramid that has none.
