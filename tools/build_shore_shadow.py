#!/usr/bin/env python
"""Render the shore-shadow tile pyramid from Natural Earth, for development.

Run by hand, in the core image, which already has every library this needs:

    just shell                      # from core's checkout, with the stack up
    python /georiva/dev-plugins/georiva-forecast-viewer/tools/build_shore_shadow.py

The output goes to `web/public/shore-shadow/`, which `npm run dev` serves and
`vite build` copies into the bundle. It is **not** committed: the pyramid is
15,088 files and 55 MB, a pure function of this code and of a public-domain
dataset, so the repository carries the recipe and each machine makes its own
copy. A server makes its copy with `georiva render_shore_shadow`, which runs
the same code into `STATIC_ROOT` (`docs/shore-shadow.md`).

This file is a front door, not the renderer. The work is in the package:
`georiva_forecast_viewer.pyramid` orchestrates, `shore_shadow.py` draws a
tile. A tool outside the package could not reach a server, because what the
plugin installer puts on one is the checkout, and what Django can call into
is the package.

The shadow exists because the viewer's basemap gives land and sea the same
grey; the band is what separates them without colouring either. Before this,
it came from a third-party Google Cloud Storage bucket with no licence, no
terms and no identifiable owner, which also baked its own rendering of
African borders in under ours (wmo-raf/georiva-forecast-viewer#15).

Why this is a script and not a Celery task: the pyramid is a function of
Natural Earth and the blur, both fixed. It changes when somebody decides it
should look different, which is a reviewed commit, not a scheduled job.

**Source:** Natural Earth 1:10m physical — land, minor islands and lakes.
Public domain, so there is no attribution to carry and no licence to honour,
and it is a reference a national met service can check against. The zips are
cached under `--cache` (gitignored) so a re-render is offline.

**Extent:** z0 to `--max-zoom`, default 8. Natural Earth 1:10m is good to a few
hundred metres; a 512-pixel tile at z6 is 1.2 km a pixel, at z8 it is 300 m,
and past that the shadow would be visibly off the coastline the style draws
from OpenMapTiles over the top of it. The style fades the raster out above the
pyramid rather than overzooming it, so the band simply stops being drawn where
it would stop being true. `web/src/map/basemap.ts` carries the matching
`SHADOW_MAX_ZOOM`; change one and you must change the other.

Only tiles that hold a shore are written. Most of the world has none, and an
empty PNG is a file every client would fetch to no effect.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

from georiva_forecast_viewer.pyramid import render_pyramid  # noqa: E402
from georiva_forecast_viewer.shore_shadow import MAX_ZOOM  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=REPO / "web" / "public" / "shore-shadow")
    parser.add_argument("--cache", type=Path, default=REPO / ".natural-earth")
    parser.add_argument("--max-zoom", type=int, default=MAX_ZOOM)
    parser.add_argument(
        "--jobs",
        type=int,
        default=os.cpu_count() or 1,
        help="worker processes to render with; 1 renders in this process",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="skip the render and only check the tiles already in --out for seams",
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="leave tiles already in --out in place; by default the pyramid is "
        "rebuilt from empty, so a tile that should no longer exist cannot "
        "survive as a stale file nobody notices",
    )
    options = parser.parse_args(argv)

    return render_pyramid(
        out=options.out,
        cache=options.cache,
        max_zoom=options.max_zoom,
        jobs=options.jobs,
        keep=options.keep,
        verify_only=options.verify_only,
        log=lambda line: print(line, flush=True),
    )


if __name__ == "__main__":
    raise SystemExit(main())
