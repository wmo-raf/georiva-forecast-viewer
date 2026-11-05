"""Building the shore-shadow pyramid: Natural Earth in, PNG tiles out.

The renderer proper is `shore_shadow.py` — one tile, given a geometry. This is
everything around it: fetching the source data, assembling dry ground, walking
the tiles that have a shore on them, spreading the work over processes, and
checking the result against whole-world renders.

It lives in the package rather than in `tools/` because the pyramid has two
front doors onto one implementation:

- `tools/build_shore_shadow.py`, for a developer, writing into
  `web/public/shore-shadow/` where `npm run dev` and `vite build` find it.
- `georiva render_shore_shadow`, for a server, writing into `STATIC_ROOT`
  beside what `collectstatic` put there.

Nothing here imports Django, so the tool can run it from a checkout with no
settings configured, exactly as it did when this was a script.

Why the pyramid is made twice over instead of once and committed: it is
15,088 files and 55 MB, a pure function of this code and of a public-domain
dataset. Committing it would put a binary artefact nobody can review into
every clone of the repository, forever, re-added wholesale on every
re-render. The recipe is small and in git; the output is large and is not.
`docs/shore-shadow.md` carries the rest of that argument.
"""

from __future__ import annotations

import multiprocessing
import random
import shutil
import urllib.request
from collections import Counter
from collections.abc import Callable
from pathlib import Path

import geopandas as gpd
import morecantile
import numpy as np
from PIL import Image
from shapely import union_all
from shapely.geometry import box

from .shore_shadow import (
    MAX_ZOOM,
    TILE_PIXELS,
    TMS,
    Shore,
    band,
    quantise,
    render,
    tiles,
    xy_bounds,
)

NATURAL_EARTH = "https://naciscdn.org/naturalearth/10m/physical"

#: Land, the islands Natural Earth keeps out of it, and the lakes it keeps in.
#: Dry ground is the first two minus the third, and its boundary is every shore
#: the map has: coastline and lake edge alike, from one pass.
LAND = ("ne_10m_land", "ne_10m_minor_islands")
WATER = ("ne_10m_lakes",)

#: Mercator cannot carry the poles, so the data is cut to the grid's own limits
#: before it is projected. Without this, reprojecting Antarctica's -90 edge
#: produces infinities and takes the whole frame with it.
LIMITS = TMS.bbox

#: Where a caller's progress goes. `print` for a script, `self.stdout.write`
#: for a management command.
Log = Callable[[str], None]

#: Where the pyramid sits under `STATIC_ROOT`, which is the one place the
#: style's `${BASE_URL}shore-shadow/{z}/{x}/{y}.png` resolves to once nginx
#: serves `/static/`. The bundle is collected to `forecast_viewer/`, so the
#: tiles go beside it rather than inside anything collectstatic owns —
#: nothing deletes them, and nothing collects them either.
STATIC_SUBPATH = Path("forecast_viewer") / "shore-shadow"


def pyramid_in(static_root: str | Path) -> Path:
    """Where `render_shore_shadow` writes and the viewer's config looks."""
    return Path(static_root) / STATIC_SUBPATH


def is_rendered(out: Path) -> bool:
    """Whether a pyramid is there at all.

    z0/0/0 is the one tile that exists in every possible pyramid — it is the
    whole world, and the world has a shore. Checking it costs one `stat`,
    which is why the viewer's config can afford to ask on each request rather
    than cache an answer that goes stale the moment someone renders.
    """
    return (out / "0" / "0" / "0.png").is_file()


def fetch(name: str, cache: Path, log: Log = print) -> Path:
    """One Natural Earth zip, cached. The only thing here that needs a network."""
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{name}.zip"
    if not path.exists():
        url = f"{NATURAL_EARTH}/{name}.zip"
        log(f"  fetching {url}")
        with urllib.request.urlopen(url, timeout=120) as response, path.open("wb") as out:
            shutil.copyfileobj(response, out)
    return path


def read(name: str, cache: Path, log: Log = print) -> gpd.GeoSeries:
    """One layer, cut to the grid's latitudes and projected into its metres."""
    frame = gpd.read_file(f"zip://{fetch(name, cache, log)}")
    clipped = frame.geometry.set_crs(frame.crs or "EPSG:4326").clip(box(*LIMITS))
    return clipped[~clipped.is_empty].to_crs("EPSG:3857")


def dry_ground(cache: Path, log: Log = print) -> Shore:
    """Land minus lakes, as one indexed geometry."""
    log("Assembling dry ground from Natural Earth")
    land = union_all([geometry for name in LAND for geometry in read(name, cache, log)])
    water = union_all([geometry for name in WATER for geometry in read(name, cache, log)])
    return Shore(land.difference(water))


#: The geometry the worker processes render from. A module global because that
#: is how it crosses a `fork`: shapely's R-trees do not pickle, so handing a
#: `Shore` to a worker as an argument is not possible, but a child inherits the
#: parent's memory, and this is read-only from then on.
_SHORE: Shore | None = None


def _render_one(tile: morecantile.Tile) -> tuple[morecantile.Tile, bytes | None]:
    """One tile in a worker process. Writing is left to the parent, which counts."""
    assert _SHORE is not None
    return tile, render(_SHORE, tile)


def build(shore: Shore, out: Path, max_zoom: int, jobs: int, log: Log = print) -> None:
    """Walk the pyramid, write what has a shore on it, count what that cost.

    The walk itself stays in the parent — it is one cheap R-tree query per
    candidate tile, and it is what decides which tiles exist — while the
    rendering, which is a rasterise and a distance transform per tile and all
    of the cost, is spread over `jobs` processes.
    """
    global _SHORE
    _SHORE = shore

    written: Counter = Counter()
    bytes_by_zoom: Counter = Counter()
    work = tiles(shore, max_zoom=max_zoom)
    pool = multiprocessing.get_context("fork").Pool(jobs) if jobs > 1 else None
    results = pool.imap_unordered(_render_one, work, chunksize=16) if pool else ((t, render(shore, t)) for t in work)

    try:
        for tile, data in results:
            if data is None:
                continue
            path = out / str(tile.z) / str(tile.x) / f"{tile.y}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            written[tile.z] += 1
            bytes_by_zoom[tile.z] += len(data)
            total = sum(written.values())
            if total % 1000 == 0:
                log(f"  {total} tiles, {sum(bytes_by_zoom.values()) / 1e6:.1f} MB")
    finally:
        if pool:
            pool.close()
            pool.join()

    log(f"\n{'zoom':>5} {'tiles':>8} {'MB':>8} {'band px':>9}")
    for zoom in sorted(written):
        log(f"{zoom:>5} {written[zoom]:>8} {bytes_by_zoom[zoom] / 1e6:>8.2f} {band(zoom).pixels:>9.0f}")
    log(f"{'all':>5} {sum(written.values()):>8} {sum(bytes_by_zoom.values()) / 1e6:>8.2f}")


def verify(shore: Shore, out: Path, per_zoom: int = 20, seed: int = 0, log: Log = print) -> int:
    """Check sampled tiles against one render of the area around them.

    "No tile seams" cannot be checked by comparing two tiles' shared edges, and
    the first version of this tried: the shadow is *meant* to jump the whole
    ramp at a shoreline — land is hard-masked to zero and the water beside it
    is at the darkest step — so wherever a coast runs along a tile boundary, a
    full-height step across that boundary is the right answer. Such a check
    reported 1,880 seams in a pyramid that has none.

    What a seam actually is: a tile that is not the same picture as its part of
    the whole world. So this renders a 2x2 block of tiles as *one* 1024-pixel
    window and compares each quarter against the PNG that shipped for it, which
    is the unit tests' seam check asked of real coastlines. A tile that was
    skipped as empty has to come out empty here too — "mostly empty" would be a
    missing band at the edge of a shore, which is the same bug in the other
    direction.
    """
    rng = random.Random(seed)
    worst = 0
    bad = 0

    def shipped(zoom: int, x: int, y: int) -> np.ndarray:
        path = out / str(zoom) / str(x) / f"{y}.png"
        if not path.exists():
            return np.zeros((TILE_PIXELS, TILE_PIXELS), dtype=np.uint8)
        # Through RGBA, not the raw indices: `optimize` is free to renumber a
        # palette per tile, so the alpha is the only thing two tiles share.
        return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)[..., 3]

    for zoom_dir in sorted(out.iterdir(), key=lambda path: int(path.name)):
        zoom = int(zoom_dir.name)
        if zoom == 0:
            continue  # one tile: no join to be wrong about.
        # The block is the parent tile's extent, but at the children's
        # resolution and so with the children's band: a 2x2 block of z5 tiles
        # is 16 px of band, not z4's 11.
        shading = band(zoom)
        table = np.array([0, *shading.alphas], dtype=np.uint8)
        written = [(int(x.name), int(tile.stem)) for x in zoom_dir.iterdir() for tile in x.glob("*.png")]
        for x, y in rng.sample(written, min(per_zoom, len(written))):
            block = morecantile.Tile(x // 2, y // 2, zoom - 1)
            together = shore.shadow(xy_bounds(block), TILE_PIXELS * 2, TILE_PIXELS * 2, shading)
            expected = table[quantise(together, shading)]
            for child in TMS.children(block):
                row = (child.y - block.y * 2) * TILE_PIXELS
                column = (child.x - block.x * 2) * TILE_PIXELS
                quarter = expected[row : row + TILE_PIXELS, column : column + TILE_PIXELS]
                difference = np.abs(quarter.astype(int) - shipped(child.z, child.x, child.y).astype(int))
                worst = max(worst, int(difference.max()))
                if difference.any():
                    bad += 1
                    if bad <= 5:
                        log(
                            f"  z{child.z} {child.x}/{child.y} differs from the whole-world render "
                            f"in {int((difference > 0).sum())} pixels, by up to {int(difference.max())} alpha"
                        )

    log(f"worst difference {worst} alpha over the sample; {bad} tiles disagree with their surroundings")
    return 1 if bad else 0


def render_pyramid(
    out: Path,
    cache: Path,
    max_zoom: int = MAX_ZOOM,
    jobs: int = 1,
    keep: bool = False,
    verify_only: bool = False,
    log: Log = print,
) -> int:
    """The whole job, as both front doors run it. Non-zero if a tile has a seam.

    By default the pyramid is rebuilt from empty, so a tile that should no
    longer exist cannot survive as a stale file nobody notices; `keep` leaves
    what is there. The verification at the end is not optional — a seam is
    invisible until someone looks at the right coast at the right zoom, which
    is to say until a user does.
    """
    if out.exists() and not (keep or verify_only):
        log(f"Clearing {out}")
        shutil.rmtree(out)

    shore = dry_ground(cache, log)
    if not verify_only:
        log(f"Rendering z0-z{max_zoom} into {out}")
        build(shore, out, max_zoom, jobs, log)

    log(f"\nChecking {out} against whole-world renders")
    return verify(shore, out, log=log)
