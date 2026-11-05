"""What the shore shadow's renderer has to get right.

Five things, and they are the five ways this can be wrong without anybody
noticing until it is on a national met service's screen:

0. **The band is as wide as it should be, at the zoom it is at.** The one that
   got away: a single width taken from one z6 tile and applied everywhere, which
   is a hairline where it was measured and 2,200 km of darkened ocean at the
   world view. Nothing in the renderer was wrong — it rendered exactly what it
   was told, everywhere.

1. **The band is on the water only.** The whole reason for rendering a raster
   rather than drawing a line is that this holds by construction. A test is how
   it keeps holding.
2. **There are no seams.** A tile rendered on its own must equal the same
   region cut out of a render of a larger area. Get the padding wrong and every
   tile boundary shows an edge — on a map, at every zoom, in the one part of
   the picture that is meant to be a gradient.
3. **The pyramid is only the shore.** Most of the world has no coast in it, and
   a build that writes an empty PNG for each of those tiles ships tens of
   thousands of files that do nothing.
4. **The format is the one that works.** Four-bit palette, black, nine alpha
   steps over transparency — measured off the tiles this replaced, so that
   changing the host did not restyle the map.

These use synthetic geometry rather than Natural Earth: a half-world of land
with a straight shore, and an island. Nothing here downloads anything, which is
why it can run in the plugin's own suite.
"""

import io
import math

import morecantile
import numpy as np
from django.test import SimpleTestCase
from PIL import Image
from shapely.geometry import MultiPolygon, box

from georiva_forecast_viewer.shore_shadow import (
    BAND_PIXELS,
    CHAMFER,
    GAIN,
    LEVELS,
    MAX_ZOOM,
    TILE_PIXELS,
    TMS,
    Shore,
    _distance_to_land,
    band,
    encode,
    profile,
    quantise,
    render,
    tiles,
    xy_bounds,
)

#: The band most of these tests work in. z6 is the widest zoom whose tiles the
#: fixtures here are sized for, and the one the eye spends most time at.
BAND = band(6)

WORLD = TMS.xy_bbox


def _west_half() -> Shore:
    """Land over the western hemisphere: one straight, vertical shore at x = 0."""
    return Shore(MultiPolygon([box(WORLD.left, WORLD.bottom, 0.0, WORLD.top)]))


def _island(size: float = 2_000_000.0) -> Shore:
    """A square island at the origin, small enough to sit inside one z2 tile."""
    return Shore(MultiPolygon([box(-size, -size, size, size)]))


class BandWidthTests(SimpleTestCase):
    """The one number that is not the same at every zoom, and why.

    The borrowed pyramid's band was measured against true distance offshore and
    turned out to be a ramp — about 4 px at the world view, 20 at z6, 25 from
    z7 — not the single width the first version of this module used everywhere.
    That mistake was 2,200 km of darkened ocean at z0 where the tiles being
    replaced had 310, and it is the only thing about this renderer a user
    complained about, so the shape of the ramp is held here.
    """

    def test_the_band_grows_with_zoom(self):
        widths = [band(zoom).pixels for zoom in range(MAX_ZOOM + 1)]
        self.assertEqual(widths, sorted(widths), f"{widths} should never narrow as you zoom in")
        self.assertLess(widths[0], 6, "the world view gets a hairline, not a smear")
        self.assertGreater(widths[6], 15, "and a close zoom gets a band you can see")

    def test_it_never_doubles_in_one_zoom(self):
        """What the pyramid walk's pruning rests on.

        A tile is skipped when no shore comes within its padded extent, and its
        children are skipped with it. That is only sound while a child's padded
        extent lies inside its parent's — the tile halves, so the band may grow
        by anything up to a factor of two and no more. A table that broke this
        would silently drop tiles whose shadow is cast from outside them.
        """
        for zoom in range(MAX_ZOOM):
            wider = band(zoom + 1).pixels / band(zoom).pixels
            self.assertLessEqual(wider, 2.0, f"z{zoom} to z{zoom + 1} more than doubles the band")

    def test_the_table_runs_out_rather_than_extrapolating(self):
        # Past the last zoom the pyramid has, the last width stands. Nothing
        # should ask for it — `tiles()` stops at MAX_ZOOM — but a band that
        # kept growing off the end of the table would be a silent widening.
        self.assertEqual(band(MAX_ZOOM + 3).pixels, BAND_PIXELS[-1])

    def test_each_zoom_sees_further_than_its_band_reaches(self):
        """The padding is what makes a tile a crop of the world; it has to clear the band."""
        for zoom in range(MAX_ZOOM + 1):
            self.assertGreater(band(zoom).pad, band(zoom).pixels, f"z{zoom} crops inside its own band")

    def test_the_shore_step_is_the_same_at_every_zoom(self):
        # Only the reach changes. Their peak alpha was ~176 at every zoom too:
        # the band gets shorter as you zoom out, not lighter.
        for zoom in range(MAX_ZOOM + 1):
            self.assertEqual(band(zoom).alphas[-1], 172, f"z{zoom}")


class StepTests(SimpleTestCase):
    def test_nine_steps_over_transparency(self):
        steps = BAND
        self.assertEqual(len(steps.alphas), LEVELS)
        self.assertEqual(len(steps.thresholds), LEVELS)
        self.assertEqual(steps.transparency[0], 0)
        self.assertEqual(len(steps.transparency), LEVELS + 1)

    def test_the_steps_ascend_and_stay_in_range(self):
        alphas = BAND.alphas
        self.assertEqual(list(alphas), sorted(set(alphas)))
        self.assertGreaterEqual(alphas[0], 1)
        self.assertLessEqual(alphas[-1], 255)

    def test_the_step_at_the_shore_is_as_dark_as_the_tiles_this_replaced(self):
        # 173 of 255 in the borrowed pyramid; 172 here, which is the same
        # number through one rounding. The gain exists to reach it: a plain
        # Gaussian over a step edge would stop at 128.
        self.assertEqual(BAND.alphas[-1], 172)

    def test_the_band_at_z6_is_as_wide_as_the_tiles_this_replaced(self):
        # 20 px, measured off their z6 tiles the same way. The ramp as a whole
        # is held in BandWidthTests; this is the rung the fixtures here use.
        self.assertAlmostEqual(BAND.pixels, 20, delta=2)

    def test_the_steps_are_evenly_spaced_in_distance_not_in_alpha(self):
        """On a straight shore, each step should be about as wide as the next.

        This is the band as a user sees it, which is why it is measured off a
        rendered row rather than off the ramp's own numbers. Steps cut at even
        *alpha* would crowd eight of the nine into the first few pixels and
        leave the rest of the band one flat tone.
        """
        steps = BAND
        shadow = _west_half().shadow((-5_000_000.0, -5_000_000.0, 5_000_000.0, 5_000_000.0), 200, 200, BAND)
        offshore = quantise(shadow, steps)[100][100:]
        widths = [int((offshore == level).sum()) for level in range(2, LEVELS + 1)]
        stride = steps.pixels / LEVELS
        for level, width in zip(range(2, LEVELS + 1), widths, strict=True):
            self.assertAlmostEqual(width, stride, delta=1.5, msg=f"step {level} of {widths}")


class OneSidedTests(SimpleTestCase):
    """The band falls in the water, and nowhere else."""

    def setUp(self):
        self.shore = _west_half()
        # A window straddling the shore, one tile wide at z2's resolution.
        self.bounds = (-5_000_000.0, -5_000_000.0, 5_000_000.0, 5_000_000.0)

    def _shadow(self):
        return self.shore.shadow(self.bounds, 200, 200, BAND)

    def test_nothing_falls_on_land(self):
        shadow = self._shadow()
        dry = self.shore.dry_mask(self.bounds, 200, 200)
        self.assertTrue(dry.any(), "the fixture should cover land")
        self.assertEqual(shadow[dry == 1].max(), 0.0)

    def test_the_water_beside_the_shore_is_darkened(self):
        shadow = self._shadow()
        row = shadow[100]
        # The shore is the middle of the window; water is to its right.
        self.assertGreater(row[101], 0.5)

    def test_it_fades_away_from_the_shore(self):
        row = self._shadow()[100]
        offshore = row[101:140]
        self.assertTrue(np.all(np.diff(offshore) <= 1e-6), "the band should only fall")
        self.assertEqual(row[-1], 0.0, "and reach nothing well before the far side")

    def test_swapping_the_masks_puts_it_on_the_other_side(self):
        """The lake-interior variant, as the issue describes it: one flip."""
        inverted = Shore(MultiPolygon([box(0.0, WORLD.bottom, WORLD.right, WORLD.top)]))
        shadow = inverted.shadow(self.bounds, 200, 200, BAND)
        self.assertEqual(shadow[100][101:140].max(), 0.0)
        self.assertGreater(shadow[100][99], 0.5)

    def test_nothing_is_darker_than_the_shore_itself(self):
        # The darkest water is the first pixel offshore, half a pixel out.
        self.assertLessEqual(self._shadow().max(), profile(0.0, BAND.sigma))
        self.assertGreaterEqual(self._shadow().max(), profile(1.0, BAND.sigma))

    def test_narrow_water_keeps_a_light_middle(self):
        """A lake is water with a shadow around its edge, not a black slug.

        This is the one place the renderer departs from the formula the issue
        wrote down. Blurring the land mask sums the contributions of every
        shore in reach, so water narrower than the band saturates and the whole
        body goes to the darkest step: at z5 that is Tanganyika, Kivu and
        Malawi rendered as black slugs on a map whose job is to be quiet.
        Reading the profile off each pixel's own distance to land gives the
        same picture on an ocean coast and never saturates.
        """
        world = 1_200_000.0
        half = 90_000.0  # a lake about 15 px wide in this window: inside the band
        shore = Shore(MultiPolygon([box(-world, -world, world, world).difference(box(-half, -half, half, half))]))
        bounds = (-world, -world, world, world)
        shadow = shore.shadow(bounds, 200, 200, BAND)
        dry = shore.dry_mask(bounds, 200, 200)
        self.assertEqual(dry[100, 100], 0, "the middle of the window should be in the lake")

        middle = float(shadow[100, 100])
        edge = float(shadow[dry == 0].max())
        self.assertGreater(edge, 0.5, "its shore should still be the darkest step")

        # The lake is 180 km across in a window of 12 km a pixel, so its middle
        # is about 7 px from either shore and should be as dark as 7 px from
        # *one* shore — not as dark as the shore, which is what summing both
        # banks would give.
        self.assertLess(middle, edge)
        self.assertAlmostEqual(middle, profile(7.0, BAND.sigma), delta=0.05)

    def test_an_all_water_window_is_empty(self):
        shadow = _island().shadow((WORLD.left, 0.0, WORLD.left + 1_000_000.0, 1_000_000.0), 64, 64, BAND)
        self.assertEqual(shadow.max(), 0.0)


class SeamTests(SimpleTestCase):
    """A tile has to be a crop of the world, not a render of itself.

    The shadow is computed on a padded extent and cropped back for exactly this
    reason. These compare a tile rendered on its own against one render of the
    area around it — the only check that would catch padding removed as an
    optimisation, which is a change that makes every tile cheaper and the map
    worse.

    What they deliberately do not do is compare two tiles' shared edges. The
    shadow is *meant* to jump the whole ramp at a shoreline — land is zero and
    the water beside it is the darkest step — so wherever a coast runs along a
    tile boundary, a full-height step across that boundary is the right answer.
    The build script's own check made that mistake first and reported 1,880
    seams in a pyramid that has none (`docs/shore-shadow.md`).
    """

    def setUp(self):
        self.shore = _island(size=3_000_000.0)

    def test_a_tile_equals_its_part_of_a_larger_render(self):
        alone = self.shore.shadow(xy_bounds(morecantile.Tile(2, 1, 2)), TILE_PIXELS, TILE_PIXELS, BAND)

        # The 2x2 block of z2 tiles that tile belongs to, in one go, at the same
        # resolution — so the tile above is the block's bottom-left quarter.
        together = self.shore.shadow(xy_bounds(morecantile.Tile(1, 0, 1)), TILE_PIXELS * 2, TILE_PIXELS * 2, BAND)
        quarter = together[TILE_PIXELS : TILE_PIXELS * 2, 0:TILE_PIXELS]

        # Floats, so compare below the quantisation step the output actually
        # has: anything under half an alpha unit cannot reach a PNG.
        self.assertLess(np.abs(alone - quarter).max() * 255, 0.5)

    def test_a_tile_whose_shadow_is_cast_from_outside_it_is_still_drawn(self):
        """The padding has to reach beyond the tile, not just into it.

        A tile of open water whose nearest land is in the next tile still
        carries the end of that land's band. If the window were not grown, this
        tile would come back empty and the band would stop dead at its edge —
        the same seam, arriving as an absence rather than a step.
        """
        # A square window of open water starting one metre east of the island.
        edge = 3_000_000.0
        bounds = (edge + 1.0, -250_000.0, edge + 500_001.0, 250_000.0)
        shadow = self.shore.shadow(bounds, 64, 64, BAND)
        self.assertEqual(self.shore.dry_mask(bounds, 64, 64).max(), 0, "the window should hold no land")
        self.assertGreater(shadow[:, 0].max(), 0.5, "the band from the land behind it is missing")
        self.assertEqual(shadow[:, -1].max(), 0.0, "and it should still fade out across the window")


class PyramidTests(SimpleTestCase):
    """Only the tiles with a shore in them, and the whole shore."""

    def test_the_whole_world_is_one_tile_and_it_has_the_shore_in_it(self):
        self.assertEqual(list(tiles(_island(), max_zoom=0)), [morecantile.Tile(0, 0, 0)])

    def test_open_water_is_not_walked(self):
        found = list(tiles(_island(size=1_000_000.0), max_zoom=3))
        self.assertEqual([tile for tile in found if tile.z == 0], [morecantile.Tile(0, 0, 0)])
        # The island sits on the origin, so at z3 only the tiles around the
        # middle of the world can hold it — not all 64.
        at_three = [tile for tile in found if tile.z == 3]
        self.assertGreater(len(at_three), 0)
        self.assertLess(len(at_three), 16)
        for tile in at_three:
            self.assertIn(tile.x, (3, 4))
            self.assertIn(tile.y, (3, 4))

    def test_every_tile_walked_is_within_the_asked_for_zooms(self):
        zooms = {tile.z for tile in tiles(_island(), max_zoom=4)}
        self.assertEqual(zooms, {0, 1, 2, 3, 4})

    def test_a_shore_at_the_antimeridian_casts_across_it(self):
        """A padded window past the world's edge has to see the other edge.

        Mercator metres do not wrap, so without the shifted queries the
        easternmost and westernmost tile columns render a shore with its shadow
        missing on one side — a hard edge down the antimeridian at every zoom.
        Here the only land is a block against the *western* edge of the world,
        and the tile is in the far east: every darkened pixel in it had to come
        across the join.
        """
        reach = 400_000.0
        shore = Shore(MultiPolygon([box(WORLD.left, -reach, WORLD.left + reach, reach)]))
        self.assertTrue(shore.crosses((WORLD.right - 1_000.0, -reach, WORLD.right + 1_000.0, reach)))

        # z2 x=3: longitude 90E to 180E, nothing but water in it.
        bounds = xy_bounds(morecantile.Tile(3, 2, 2))
        shadow = shore.shadow(bounds, TILE_PIXELS, TILE_PIXELS, BAND)
        self.assertEqual(shore.dry_mask(bounds, 64, 64).max(), 0)
        self.assertGreater(shadow[:, -1].max(), 0.5, "the shadow of the land across the join is missing")
        self.assertEqual(shadow[:, : TILE_PIXELS - 40].max(), 0.0, "and it reaches no further than the blur")


class PruningTests(SimpleTestCase):
    """Why a build of the world takes minutes rather than hours.

    Both of these are about the same thing: an R-tree answers by bounding box,
    and a continent's bounding box contains the Sahara. Get this wrong and the
    walk visits every tile over Africa at every zoom, renders each one in full,
    and throws almost all of them away — slowly.
    """

    def test_deep_inland_is_not_a_shore(self):
        land = Shore(MultiPolygon([box(-8_000_000.0, -8_000_000.0, 8_000_000.0, 8_000_000.0)]))
        middle = (-10_000.0, -10_000.0, 10_000.0, 10_000.0)
        self.assertFalse(land.crosses(middle), "the bounding box says yes; the geometry says no")
        self.assertEqual(land.shadow(middle, 64, 64, BAND).max(), 0.0)

    def test_shattering_geometry_changes_nothing_it_renders(self):
        """The pieces are a cut of the original, so the raster is unchanged."""
        from shapely.geometry import Point

        coast = MultiPolygon([Point(0.0, 0.0).buffer(3_000_000.0, quad_segs=512)])
        whole = Shore(coast, limit=10**9)
        shattered = Shore(coast, limit=64)
        window = xy_bounds(morecantile.Tile(2, 1, 2))
        self.assertTrue(whole.crosses(window))
        self.assertTrue(shattered.crosses(window))
        np.testing.assert_array_equal(
            quantise(whole.shadow(window, TILE_PIXELS, TILE_PIXELS, BAND), BAND),
            quantise(shattered.shadow(window, TILE_PIXELS, TILE_PIXELS, BAND), BAND),
        )


class EncodingTests(SimpleTestCase):
    """The PNG the browser gets: 4-bit, palette, black, nine alphas."""

    def setUp(self):
        self.steps = BAND
        self.shadow = _west_half().shadow((-5_000_000.0, -5_000_000.0, 5_000_000.0, 5_000_000.0), 64, 64, BAND)

    def test_quantising_keeps_the_land_transparent(self):
        indices = quantise(self.shadow, self.steps)
        self.assertEqual(indices[:, :31].max(), 0)
        self.assertGreater(indices[:, 33:].max(), 0)

    def test_no_index_falls_outside_the_palette(self):
        self.assertLessEqual(int(quantise(self.shadow, self.steps).max()), LEVELS)

    def test_an_empty_tile_is_not_a_file(self):
        self.assertIsNone(encode(np.zeros((8, 8), dtype=np.uint8), self.steps))

    def test_a_tile_is_a_four_bit_palette_png(self):
        data = encode(quantise(self.shadow, self.steps), self.steps)
        self.assertIsNotNone(data)
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.mode, "P")
        self.assertEqual(image.size, (64, 64))
        # Read out of the IHDR rather than from Pillow, which decodes a 4-bit
        # palette into 8-bit memory and so cannot report what is on the wire.
        # Byte 24 is the bit depth, byte 25 the colour type: 3 is palette.
        self.assertEqual((data[24], data[25]), (4, 3))
        self.assertIn(b"tRNS", data[:200], "without tRNS every step is opaque black")

    def test_the_colour_is_black_and_the_shape_is_in_the_alpha(self):
        data = encode(quantise(self.shadow, self.steps), self.steps)
        pixels = np.array(Image.open(io.BytesIO(data)).convert("RGBA"))
        self.assertEqual(pixels[..., :3].max(), 0, "nothing in a greyscale basemap's shadow is coloured")
        alphas = set(np.unique(pixels[..., 3]).tolist()) - {0}
        self.assertTrue(alphas <= set(self.steps.alphas), f"{alphas} is not the measured ramp")

    def test_a_rendered_tile_round_trips(self):
        # x=2 at z2 is the water immediately east of the fixture's shore.
        data = render(_west_half(), morecantile.Tile(2, 1, 2))
        self.assertIsNotNone(data)
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.size, (TILE_PIXELS, TILE_PIXELS))

    def test_a_tile_of_open_water_renders_to_nothing(self):
        self.assertIsNone(render(_island(size=500_000.0), morecantile.Tile(0, 0, 2)))


class DistanceTests(SimpleTestCase):
    """The chamfer transform the whole band is read off.

    It is an approximation — 5-7-11 is within about 2% of Euclidean — and the
    band is 28 pixels wide, so "about 2%" has to mean half a pixel and not, say,
    the 8% a plain 3-4 chamfer would give, which would be two pixels of wobble
    in a ramp the eye reads as a smooth gradient.
    """

    def _brute_force(self, dry: np.ndarray) -> np.ndarray:
        land = np.argwhere(dry == 1)
        rows, columns = np.indices(dry.shape)
        best = np.full(dry.shape, np.inf)
        for row, column in land:
            best = np.minimum(best, np.hypot(rows - row, columns - column))
        return best

    def test_it_agrees_with_measuring_every_pixel(self):
        dry = np.zeros((40, 40), dtype=np.uint8)
        dry[5:9, 6:30] = 1  # a coast with a corner at each end
        dry[20:38, 2:6] = 1
        measured = _distance_to_land(dry).astype(float) / CHAMFER
        exact = self._brute_force(dry)
        near = exact < 30
        self.assertLess(float(np.abs(measured - exact)[near].max() / exact[near].max()), 0.03)

    def test_land_is_at_no_distance_from_itself(self):
        dry = np.zeros((8, 8), dtype=np.uint8)
        dry[3, 3] = 1
        distances = _distance_to_land(dry)
        self.assertEqual(distances[3, 3], 0)
        self.assertEqual(distances[3, 4], CHAMFER, "one step away is one pixel")

    def test_water_out_of_reach_of_any_land_is_the_far_value(self):
        distances = _distance_to_land(np.zeros((8, 8), dtype=np.uint8))
        self.assertGreater(distances.min(), BAND.pixels * CHAMFER)


class ProfileTests(SimpleTestCase):
    """The closed form the ramp is cut from, against the numeric renderer."""

    def test_the_analytic_profile_matches_what_the_renderer_produces(self):
        shadow = _west_half().shadow((-5_000_000.0, -5_000_000.0, 5_000_000.0, 5_000_000.0), 200, 200, BAND)
        row = shadow[100]
        # Pixel 100 is the first water pixel, half a pixel from the shore.
        for offset in (0, 2, 5, 10, 20):
            self.assertAlmostEqual(row[100 + offset], profile(offset + 0.5, BAND.sigma), delta=0.02)

    def test_it_is_gain_over_two_at_the_shore_itself(self):
        self.assertAlmostEqual(profile(0.0, BAND.sigma), min(1.0, GAIN / 2), places=6)

    def test_sigma_is_a_standard_deviation(self):
        # One sigma out, a cumulative Gaussian is at ~15.9% of its full height.
        self.assertAlmostEqual(profile(BAND.sigma, BAND.sigma) / GAIN, 0.5 * math.erfc(1 / math.sqrt(2)), places=6)
