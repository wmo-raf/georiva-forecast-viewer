"""Render the shore shadow onto the machine that serves it.

    georiva render_shore_shadow

The pyramid is not shipped. It is 15,088 files and 55 MB, a pure function of
`pyramid.py` and of public-domain Natural Earth, so it is rendered where it is
needed rather than carried through git, a release tag and a Docker volume to
get there. `docs/shore-shadow.md` has the argument in full.

Where it writes: `<STATIC_ROOT>/forecast_viewer/shore-shadow/`, which nginx
already serves at the address the basemap asks for. `STATIC_ROOT` is a
writable volume shared by the services; the plugin's own tree is mounted
read-only (core's ADR 0035), which is why nothing writes back into the
checkout. Run it after `collectstatic`, and only once per deployment: tiles
already there are left alone unless the shape of the shadow itself changes.

What it costs, measured on four workers: about seven and a half minutes and
under 400 MB of RSS, plus a one-off ~20 MB Natural Earth download. `--jobs`
decides how much of the box that takes; the default is every core, which on a
server running the rest of the stack is usually not what you want.

Nothing runs this for you. ADR 0035 forbids install hooks, and a server
rendering a basemap on a schedule would be the wrong shape anyway: the
pyramid changes when somebody changes the renderer, not when time passes.
Until it is run, an organisation with the shadow switched on is reported as
having no shadow and a system check says so.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ...pyramid import is_rendered, pyramid_in, render_pyramid
from ...shore_shadow import MAX_ZOOM


class Command(BaseCommand):
    help = "Render the basemap's shore-shadow tiles into STATIC_ROOT."

    def add_arguments(self, parser):
        parser.add_argument(
            "--jobs",
            type=int,
            default=max(1, (os.cpu_count() or 2) // 2),
            help="worker processes to render with (default: half the cores, so the stack keeps the rest)",
        )
        parser.add_argument("--max-zoom", type=int, default=MAX_ZOOM)
        parser.add_argument(
            "--out",
            type=Path,
            default=None,
            help="override the destination; the default is <STATIC_ROOT>/forecast_viewer/shore-shadow",
        )
        parser.add_argument(
            "--cache",
            type=Path,
            default=None,
            help="where the Natural Earth zips are kept between renders (default: a directory beside --out)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="re-render even though a pyramid is already there",
        )
        parser.add_argument(
            "--verify-only",
            action="store_true",
            help="render nothing; check the tiles already in place for seams",
        )

    def handle(self, *args, **options):
        static_root = settings.STATIC_ROOT
        if not static_root and options["out"] is None:
            raise CommandError("STATIC_ROOT is not set, so there is nowhere to render to; pass --out.")

        out = options["out"] or pyramid_in(static_root)
        # Beside the pyramid, not inside it: the pyramid is cleared before a
        # re-render, and re-downloading 20 MB each time would be a tax on
        # every deploy that changes the shadow.
        cache = options["cache"] or out.parent / ".natural-earth"

        if is_rendered(out) and not (options["force"] or options["verify_only"]):
            self.stdout.write(f"{out} already holds a pyramid; nothing to do (--force to render it again).")
            return

        out.parent.mkdir(parents=True, exist_ok=True)
        seams = render_pyramid(
            out=out,
            cache=cache,
            max_zoom=options["max_zoom"],
            jobs=options["jobs"],
            verify_only=options["verify_only"],
            log=lambda line: self.stdout.write(line),
        )
        if seams:
            raise CommandError("the rendered tiles disagree with whole-world renders; see the report above")

        self.stdout.write(
            self.style.SUCCESS(
                f"Rendered the shore shadow into {out}. "
                "Switch it on per organisation in the forecast viewer's settings."
            )
        )
