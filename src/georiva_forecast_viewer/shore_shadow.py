"""The shore's shadow: the soft dark band the basemap draws in the water.

The viewer's basemap gives land and sea the same grey (`web/src/map/basemap.ts`),
so the only thing separating them is the coastline — one hairline, at every
zoom, over data that is itself grey in half of every palette. The shadow is
what makes the two read as different places: a graduated darkening that starts
at the shore and falls away into the water, on the water side only.

MapLibre cannot draw it. The vector attempt pushed a blurred line off the shore
with `line-offset`, and `line-offset` displaces each vertex along its own
normal, which turns the geometry inside out wherever the offset outruns the
spacing between vertices. Vector tiles are simplified to about a pixel per
zoom, so that spacing stays a few pixels however far you zoom in; on Lake
Victoria's shoreline it folded everywhere, each fold stacking alpha on alpha
until the lake was a field of black starbursts.

So the band is pre-rendered here, as raster tiles, by an algorithm that is
one-sided **by construction** and has no geometry to fold:

    dry      = rasterise(land - lakes)       # 1 on dry ground, 0 on water
    distance = how far each pixel is from dry ground, in pixels
    shadow   = profile(distance) * (1 - dry) # a ramp into the water, and
                                             # exactly zero on every land pixel

`1 - dry` is a hard mask, not a feathered one, so the band's landward edge is
the shoreline to the pixel and cannot bleed inland. Swapping the two factors
would put the band on the land instead, which is how the same pass would render
the inland variant if it were ever wanted.

The shape of `profile` is a Gaussian blur's: the issue this comes from
describes the algorithm as blurring the land mask and multiplying by the water
mask, and `profile` is exactly what that produces across a straight shore. What
a distance ramp does differently is the *narrow* case. A blur sums the
contributions of every shore in reach, so water narrower than the blur — the
rift lakes at z5, a strait, a river mouth — saturates, and the whole body
renders at the darkest step; the map then shouts about Tanganyika instead of
about the weather. Reading the profile off each pixel's own distance to land
gives the same picture on an ocean coast and keeps a lake's middle light
however narrow it is, because no pixel is ever darker than its own distance
offshore says. That was a deliberate choice against the issue's literal
formula, and it is the only place this departs from it.

This module is the renderer and nothing else: it takes geometry it is handed
and returns PNG bytes. Fetching Natural Earth, assembling the land, walking the
pyramid and writing files is `tools/build_shore_shadow.py`, which is run by
hand and whose output is committed under `web/public/shore-shadow/`. Nothing
here is imported by the Django app at load time, and no server ever runs it.

It sits in the app package all the same, rather than beside the script in
`tools/`, for one reason: the plugin's CI runs the Django suite inside the core
image and nothing else, so this is where a test of it is a test that actually
runs. The cost is a module shipped to servers that will never import it, which
is a few hundred lines in a wheel; the alternative was a renderer whose only
guard was somebody remembering to run it.

The numbers below are not free parameters. They were measured off the
pre-rendered tiles the viewer borrowed from a third-party bucket before this
existed (wmo-raf/georiva-forecast-viewer#15), so that replacing the host did
not also silently restyle the map: nine alpha steps over transparency, pure
black, and the step at the shore reaching alpha 173 of 255 — 172 here, the same
number through one rounding.

The width of the band was measured the same way and is the one number that is
*not* the same at every zoom. See `BAND_PIXELS`.
"""

from __future__ import annotations

import io
import math
from collections.abc import Iterator
from dataclasses import dataclass
from functools import cache

import morecantile
import numpy as np
import shapely
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from shapely import STRtree
from shapely.affinity import translate
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

#: The grid, and the tile size that goes with it. MapLibre is told
#: ``tileSize: 512``, so a tile covers the Web Mercator quad of its own z/x/y
#: at twice the usual pixel density — the same pyramid addresses, read sharper.
TMS = morecantile.tms.get("WebMercatorQuad")
TILE_PIXELS = 512

#: The width of the world in Web Mercator metres, used to wrap a padded window
#: across the antimeridian.
WORLD_METRES = TMS.xy_bbox.right - TMS.xy_bbox.left

#: How far the shadow reaches into the water, in output pixels, at each zoom
#: from z0 up. Indexed by zoom; past the end, the last value stands.
#:
#: This is measured, not chosen. The borrowed pyramid's alpha was binned against
#: the true distance offshore (Natural Earth as the ruler, so the two are
#: directly comparable) and it came out as a ramp: about 4 px at the world view,
#: 7 at z3, 11 at z4, 16 at z5, 20 at z6, flattening around 25 from z7 on.
#:
#: The first attempt at this module used one width — the ~27 px read off a
#: single z6 tile — at every zoom, and the world view was unrecognisable: 4 px
#: at z0 is 310 km of darkened ocean, 28 px is 2,200 km, and the Atlantic went
#: grey from Brazil to Guinea. Neither a constant screen width nor a constant
#: distance offshore is what a cartographer drew here; the ramp in between is.
BAND_PIXELS = (4.0, 4.0, 4.0, 7.0, 11.0, 16.0, 20.0, 25.0, 25.0)

#: The last zoom the pyramid is rendered for, and the last entry above. The
#: style fades the layer out above this rather than overzooming it, so the two
#: have to move together: `SHADOW_MAX_ZOOM` in `web/src/map/basemap.ts`.
MAX_ZOOM = len(BAND_PIXELS) - 1

#: A Gaussian blur across a step edge reaches 0.5 at the edge itself, which is a
#: weaker shadow than the one being replaced. The gain lifts the shore step to
#: the measured 173/255 (172 after rounding). Nothing is ever darker, because
#: nowhere is more "just offshore" than the shore.
GAIN = 1.35

#: Nine steps over transparency: ten palette entries, four bits a pixel.
LEVELS = 9

#: How far outside a tile the renderer has to see: everything within reach of
#: the band, with room to spare. A tile rendered on this much padding and then
#: cropped is pixel-identical to the same region cut out of a render of the
#: whole world, because no pixel inside the crop can have land nearer than this
#: that the window did not contain. That is the entire seam story: get it wrong
#: and every tile boundary draws a visible edge.
#:
#: In sigmas, so that it shrinks with the band at the low zooms — four sigmas is
#: about 1.4 times the band, at any zoom.
PAD_SIGMAS = 4


def profile(distance: float, sigma: float, gain: float = GAIN) -> float:
    """The shadow's alpha, 0–1, `distance` pixels into the water from a straight shore.

    This is the analytic form of what the renderer does numerically: a Gaussian
    blur of a step edge is that edge convolved with a Gaussian, which is the
    Gaussian's own cumulative distribution. Having it in closed form is what
    lets the ramp be cut at exact distances rather than by eye.
    """
    return gain * 0.5 * math.erfc(distance / (sigma * math.sqrt(2)))


def _reach(sigma: float, gain: float = GAIN) -> float:
    """How far a profile of this sigma reaches before it is worth no alpha at all."""
    distance = 0.0
    while profile(distance + 0.05, sigma, gain) * 255 >= 1.0:
        distance += 0.05
    return distance


#: How many sigmas wide the band is — about 2.8, and the same whatever sigma is,
#: since the profile's shape does not change. It is what turns a band measured
#: in pixels into the sigma that produces it.
SIGMAS_ACROSS_BAND = _reach(1.0)


@dataclass(frozen=True)
class Band:
    """The shadow at one zoom: how far it reaches, and the steps it is cut into.

    Everything that depends on the zoom is here and nowhere else, because these
    numbers have to agree with each other. The padding has to clear the reach or
    tiles seam; the steps have to span the reach or the band ends in a cliff;
    the ramp a pixel is read off has to be the one the palette was written from.
    Passing them around as loose floats is how two of the three end up from
    different zooms.

    The steps are spaced by *distance from the shore*, not by alpha. A Gaussian
    falls steeply and then flattens, so equal alpha steps would crowd eight of
    the nine into the first few pixels and leave the rest of the band one flat
    tone; equal distance steps give a band that reads as evenly graded, which is
    how the borrowed tiles were cut and why their alphas (173, 130, 91, 60, 41,
    26, 14, 5, 1) are so unevenly spread.

    `alphas` ascends, so the palette is ``[0, *alphas]`` and index *i* in a
    quantised array means ``alphas[i - 1]``. `thresholds` ascends with it: it is
    what `quantise` digitises against — each step's lower bound, so below the
    first of them the band is past its last step and simply transparent.
    """

    zoom: int
    pixels: float
    sigma: float
    pad: int
    alphas: tuple[int, ...]
    thresholds: tuple[float, ...]

    @property
    def palette(self) -> list[int]:
        """Black, once per entry: the shadow has no colour, only alpha."""
        return [0, 0, 0] * (len(self.alphas) + 1)

    @property
    def transparency(self) -> bytes:
        """The tRNS chunk: index 0 invisible, then the steps as measured."""
        return bytes([0, *self.alphas])


@cache
def band(zoom: int, levels: int = LEVELS, gain: float = GAIN) -> Band:
    """The band at `zoom`, cut into `levels` steps of equal width in pixels.

    The steps sit at even distances across the reach, the first of them *at* the
    shore, so the darkest step is the full height of the ramp rather than an
    average over the first stride of it. A pixel takes the step whose distance
    it is nearest, which is what the thresholds — the profile at the midpoints
    between those distances — are.

    At the world view the reach is 4 px and the nine steps are sub-pixel, so a
    coast shows three or four tones rather than nine. That is not a defect: it
    is what 4 px of gradient looks like, and what the borrowed tiles did there
    too (125, 29, 5 and done).
    """
    pixels = BAND_PIXELS[min(zoom, MAX_ZOOM)]
    sigma = pixels / SIGMAS_ACROSS_BAND
    stride = pixels / levels
    at = [index * stride for index in range(levels)]
    # Alpha falls as distance grows, so both tuples are reversed into the
    # ascending order the palette and `np.digitize` want.
    alphas = [round(profile(distance, sigma, gain) * 255) for distance in at]
    thresholds = [profile(distance + stride / 2, sigma, gain) * 255 for distance in at]
    return Band(
        zoom=zoom,
        pixels=pixels,
        sigma=sigma,
        pad=math.ceil(PAD_SIGMAS * sigma),
        alphas=tuple(reversed(alphas)),
        thresholds=tuple(reversed(thresholds)),
    )


#: The distance transform's resolution: how many steps it counts to a pixel.
#: The chamfer weights below are 5, 7 and 11 for a step, a diagonal and a
#: knight's move — Borgefors' 5-7-11 — which approximate 5x the Euclidean
#: distance to within about 2%, so half a pixel at the far end of the widest
#: band there is. Nothing the eye can find in a nine-step ramp, and it keeps
#: the whole transform in integers.
CHAMFER = 5
_STEP, _DIAGONAL, _KNIGHT = 5, 7, 11
_FAR = 1 << 24


def _take(row: np.ndarray, offset: int) -> np.ndarray:
    """`row` read at `j + offset`, with `_FAR` where that falls off the end."""
    shifted = np.full_like(row, _FAR)
    if offset == 0:
        return row.copy()
    if offset > 0:
        shifted[:-offset] = row[offset:]
    else:
        shifted[-offset:] = row[:offset]
    return shifted


def _along_row(row: np.ndarray) -> np.ndarray:
    """Propagate left to right: ``row[j] = min(row[j], row[j - 1] + step)``.

    A running minimum with a constant increment is a running minimum of the
    row with that increment taken out of it, which `np.minimum.accumulate`
    does in one pass — so the horizontal half of the chamfer costs no Python
    loop over pixels, only one over rows.
    """
    ramped = _STEP * np.arange(row.size, dtype=row.dtype)
    return np.minimum.accumulate(row - ramped) + ramped


def _distance_to_land(dry: np.ndarray) -> np.ndarray:
    """Each pixel's distance to the nearest dry pixel, in fifths of a pixel.

    A two-pass chamfer transform: one sweep down and one back up, each
    propagating the cheapest way to reach a land pixel from a small
    neighbourhood. Exact Euclidean distance would need either scipy, which is
    not in the image this runs in, or a parabola-envelope pass per row, which
    is a Python loop per pixel; neither is worth 2% on a cue that is quantised
    to nine steps.
    """
    distance = np.where(dry == 1, 0, _FAR).astype(np.int32)
    _sweep(distance, downwards=True)
    _sweep(distance, downwards=False)
    return distance


def _sweep(distance: np.ndarray, downwards: bool) -> None:
    """One pass of the chamfer, in place: every row against the two behind it.

    The two passes are mirror images — the first can only carry a distance
    forwards from land it has already seen, the second brings back what lay the
    other way — so one function does both, read in the direction it is given.
    """
    height = distance.shape[0]
    rows = range(height) if downwards else range(height - 1, -1, -1)
    back = -1 if downwards else 1

    for row in rows:
        here = distance[row]
        if 0 <= row + back < height:
            behind = distance[row + back]
            here = np.minimum(here, behind + _STEP)
            for offset in (-1, 1):
                here = np.minimum(here, _take(behind, offset) + _DIAGONAL)
            for offset in (-2, 2):
                here = np.minimum(here, _take(behind, offset) + _KNIGHT)
        if 0 <= row + 2 * back < height:
            for offset in (-1, 1):
                here = np.minimum(here, _take(distance[row + 2 * back], offset) + _KNIGHT)
        # And along the row itself, in the direction this pass is going.
        distance[row] = _along_row(here) if downwards else _along_row(here[::-1])[::-1]


def _by_distance(distance: np.ndarray, shading: Band, gain: float = GAIN) -> np.ndarray:
    """Read the profile off each pixel's distance, through a lookup table.

    `math.erfc` is scalar and there are a third of a million pixels in a padded
    tile, but the distances are integers in fifths of a pixel and the band is at
    most 25 of them wide, so the whole ramp is 130-odd values long and the
    picture is one `take`. The half-pixel is the step from a pixel's centre to
    the edge it sits against: the first pixel of water is half a pixel from the
    shore, not a whole one.
    """
    reach = math.ceil((shading.pixels + 0.5) * CHAMFER)
    table = np.array(
        [profile(max(step / CHAMFER - 0.5, 0.0), shading.sigma, gain) for step in range(reach + 1)] + [0.0],
        dtype=np.float32,
    )
    return table[np.minimum(distance, reach + 1)]


#: How many coordinates a piece of geometry may hold before it is split.
#: Natural Earth's Afro-Eurasian landmass is one ring of some two hundred
#: thousand vertices, and both things this class does are priced by vertex: an
#: R-tree over whole continents answers "is there a shore here?" with that
#: continent's *bounding box*, which contains the entire Sahara, and rasterising
#: one tile of Kenyan coast walks every vertex from Portugal to Kamchatka. Cut
#: into pieces of this size, the index prunes honestly and a tile costs what is
#: actually on it. The value only trades index size against per-tile work;
#: nothing about the output depends on it, which `PruningTests` holds it to.
SHATTER_LIMIT = 2_000


def _shatter(geometry: BaseGeometry, limit: int = SHATTER_LIMIT, depth: int = 0) -> list[BaseGeometry]:
    """Split geometry into pieces of at most `limit` coordinates, by quartering.

    A plain quadtree over the bounding box: clip into four, recurse on whatever
    is still too big. The union of the pieces is the original — `clip_by_rect`
    cuts, it does not round — so this changes performance and nothing else. The
    depth cap is for the pathological case of a vertex cloud in one spot, which
    quartering cannot separate however long it keeps trying.
    """
    pieces: list[BaseGeometry] = []
    for piece in getattr(geometry, "geoms", [geometry]):
        if piece.is_empty:
            continue
        if shapely.get_num_coordinates(piece) <= limit or depth >= 16:
            pieces.append(piece)
            continue
        west, south, east, north = piece.bounds
        middle_x, middle_y = (west + east) / 2, (south + north) / 2
        for rect in (
            (west, south, middle_x, middle_y),
            (middle_x, south, east, middle_y),
            (west, middle_y, middle_x, north),
            (middle_x, middle_y, east, north),
        ):
            pieces += _shatter(shapely.clip_by_rect(piece, *rect), limit, depth + 1)
    return pieces


class Shore:
    """Dry ground, indexed, in Web Mercator metres.

    One geometry carries both shores the map has: land minus lakes, whose
    boundary is the coastline *and* every lake's edge. Two indexes are built
    over it — the ground, to rasterise, and the shoreline, to ask whether a
    region has one at all. The second is what lets the pyramid be walked in
    minutes rather than hours: most tiles in the world have no shore on them,
    and a tile with no shore has no shadow, so it should cost nothing rather
    than a full render that produces a uniform, empty, perfectly pointless PNG.

    Both indexes are built over *shattered* geometry (see `SHATTER_LIMIT`),
    without which neither of those two things works.
    """

    def __init__(self, dry: BaseGeometry, limit: int = SHATTER_LIMIT):
        ground = _shatter(dry, limit)
        self._ground = np.array(ground, dtype=object)
        self._ground_tree = STRtree(ground)
        # The shoreline is the boundary of dry ground: coastline and lake edge
        # in one set. It is shattered after being taken, never before — the
        # boundary of a *piece* of a continent includes the cuts, and those are
        # not shores.
        shores = _shatter(dry.boundary, limit)
        self._shores = np.array(shores, dtype=object)
        self._shore_tree = STRtree(shores)

    def _hits(self, tree: STRtree, items: np.ndarray, bounds: tuple[float, float, float, float]) -> list:
        """Everything in `tree` touching `bounds`, with the world wrapped around.

        A window padded past the antimeridian has to see the land on the other
        side of it, or every tile in the easternmost and westernmost columns
        draws a shore with no shadow on one side. Mercator metres do not wrap,
        so the query is repeated against the world shifted a world's width
        either way, and the hits are shifted back.
        """
        west, south, east, north = bounds
        found = []
        for shift in (0.0, WORLD_METRES, -WORLD_METRES):
            if shift and not (east - shift > TMS.xy_bbox.left and west - shift < TMS.xy_bbox.right):
                continue
            window = box(west - shift, south, east - shift, north)
            found += [translate(items[index], xoff=shift) for index in tree.query(window)]
        return found

    def crosses(self, bounds: tuple[float, float, float, float]) -> bool:
        """Is there a shoreline inside `bounds`?

        If not, the region is all water or all ground, and either way the
        shadow over it is zero: no blur reaches it, or the land mask cancels it.

        The R-tree answers by bounding box, which over-reports; the intersection
        test is what makes the answer the question. Both matter — the tree keeps
        this cheap, the test keeps the pyramid from containing most of Africa.
        """
        window = box(*bounds)
        return any(shore.intersects(window) for shore in self._hits(self._shore_tree, self._shores, bounds))

    def dry_mask(self, bounds: tuple[float, float, float, float], width: int, height: int) -> np.ndarray:
        """Rasterise dry ground over `bounds`: 1 on land, 0 on water."""
        shapes = self._hits(self._ground_tree, self._ground, bounds)
        if not shapes:
            return np.zeros((height, width), dtype=np.uint8)
        return rasterize(
            shapes,
            out_shape=(height, width),
            transform=from_bounds(*bounds, width, height),
            fill=0,
            default_value=1,
            dtype=np.uint8,
        )

    def shadow(self, bounds: tuple[float, float, float, float], width: int, height: int, shading: Band) -> np.ndarray:
        """The shadow over `bounds` as floats, 0 where there is none.

        Rendered on a padded extent and cropped back, which is what keeps a
        tile free of seams: see `PAD_SIGMAS`. The padding is in pixels at this
        window's own resolution, so a window covering four tiles at a zoom and
        the four tiles rendered separately give the same pixels — as long as
        both are asked for the same `shading`, which is why the band is a thing
        a caller holds rather than something each call looks up for itself.
        """
        pad = shading.pad
        dry = self.dry_mask(grown(bounds, width, pad), width + 2 * pad, height + 2 * pad)
        # A pixel's own distance from dry ground, read off the ramp. `1 - dry`
        # is the raw mask, so the result is exactly zero on every land pixel.
        shadow = _by_distance(_distance_to_land(dry), shading) * (1 - dry)
        return shadow[pad : pad + height, pad : pad + width]


def quantise(shadow: np.ndarray, shading: Band) -> np.ndarray:
    """Cut a float shadow into palette indices: 0 transparent, 1–9 the steps."""
    return np.digitize(shadow * 255, shading.thresholds).astype(np.uint8)


def encode(indices: np.ndarray, shading: Band) -> bytes | None:
    """One tile as a 4-bit palette PNG, or `None` if there is nothing on it.

    `None` is the normal answer for most of the world. A tile of pure
    transparency is 2 kB that every client would fetch, decode and composite to
    no effect; leaving it off the disk makes it a 404 that MapLibre treats as an
    empty tile, which is what it is.
    """
    if not indices.any():
        return None
    image = Image.fromarray(indices, mode="P")
    image.putpalette(shading.palette)
    buffer = io.BytesIO()
    # `bits=4` is what makes this a half-byte-per-pixel image: ten palette
    # entries need four bits, and PNG has no 9-entry depth between 4 and 8.
    image.save(buffer, format="PNG", bits=4, optimize=True, transparency=shading.transparency)
    return buffer.getvalue()


def render(shore: Shore, tile: morecantile.Tile) -> bytes | None:
    """One tile, end to end: geometry in, PNG bytes or `None` out.

    The band comes from the tile's own zoom, so there is no way to render a
    tile with another zoom's width by mistake.
    """
    shading = band(tile.z)
    shadow = shore.shadow(xy_bounds(tile), TILE_PIXELS, TILE_PIXELS, shading)
    return encode(quantise(shadow, shading), shading)


def tiles(shore: Shore, max_zoom: int = MAX_ZOOM) -> Iterator[morecantile.Tile]:
    """Every tile from z0 to `max_zoom` whose padded extent contains a shore.

    Depth-first with pruning, which is sound because a child's padded extent
    always lies inside its parent's: the tile shrinks by half, and the padding,
    being a pixel count, shrinks or at worst holds. So a parent with no
    shoreline in its padded extent has no descendant with one, and the whole
    branch — most of the Pacific, most of the Sahara — is never visited at all.

    That argument needs the band to grow by less than a factor of two per zoom,
    which `BAND_PIXELS` does: 4, 4, 4, 7, 11, 16, 20, 25, 25. A table that
    doubled would make a child's reach in metres equal to its parent's, and a
    table that more than doubled would let a child see land its parent pruned.
    """

    def walk(tile: morecantile.Tile) -> Iterator[morecantile.Tile]:
        if not shore.crosses(grown(xy_bounds(tile), TILE_PIXELS, band(tile.z).pad)):
            return
        yield tile
        if tile.z < max_zoom:
            for child in TMS.children(tile):
                yield from walk(child)

    yield from walk(morecantile.Tile(0, 0, 0))


def xy_bounds(tile: morecantile.Tile) -> tuple[float, float, float, float]:
    """A tile's extent in Web Mercator metres, as (west, south, east, north).

    morecantile's own `BoundingBox` in the order everything here passes around,
    so that no caller has to spell the unpacking out for the fifth time.
    """
    bounds = TMS.xy_bounds(tile)
    return (bounds.left, bounds.bottom, bounds.right, bounds.top)


def grown(bounds: tuple[float, float, float, float], width: int, pad: int) -> tuple[float, float, float, float]:
    """`bounds` widened by `pad` pixels on every side, at `width`'s resolution.

    One function because the padded extent means one thing in two places and
    has to stay the same in both: it is what the renderer computes on before
    cropping back, and it is what the walk asks about when deciding whether a
    tile has a shore near enough to matter. If the walk's reach were the
    narrower of the two, tiles whose band comes entirely from land outside them
    would never be written.
    """
    west, south, east, north = bounds
    metres = (east - west) / width * pad
    return (west - metres, south - metres, east + metres, north + metres)
