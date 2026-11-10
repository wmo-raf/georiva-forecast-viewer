"""What ``GET /api/forecast-viewer/`` promises the web bundle, and to whom.

The route is the whole of the plugin's public surface, so its tenant boundary
is asserted here from both sides: a source on a collection the caller may not
see is absent, not forbidden, and another organisation's rows never appear
however they are named.
"""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import ANY

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from wagtail.models import Site

from georiva.core.machine_plane.addresses import render_config_token, vector_render_config_token
from georiva.organisations.testing import DEFAULT_TEST_ORG_SLUG, dial_org, join_org, org_host
from georiva_forecast_viewer.models import ForecastViewerSettings, Quantity
from georiva_forecast_viewer.pyramid import pyramid_in

from .factories import (
    IFS_VARIABLES,
    WRF_VARIABLES,
    bind,
    give_unit,
    make_collection,
    make_pressure_quantity,
    make_quantity,
    make_source,
)

URL = "georiva_forecast_viewer:catalogue"


class CatalogueTests(TestCase):
    def setUp(self):
        dial_org(self.client)

    def _quantities(self):
        return self.client.get(reverse(URL)).json()["quantities"]

    def test_a_scalar_quantity_lists_each_source_with_its_own_variable(self):
        temperature = make_quantity("t2m", name="2 m temperature")
        ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs", name="ECMWF IFS")
        wrf = make_source(make_collection("wrf-3km", variables=WRF_VARIABLES), slug="wrf", name="KMD WRF", order=1)
        bind(ifs, temperature, variable="t2m")
        bind(wrf, temperature, variable="t2")

        self.assertEqual(
            self._quantities(),
            [
                {
                    "slug": "t2m",
                    "name": "2 m temperature",
                    "kind": "scalar",
                    "icon": "",
                    "decimals": 0,
                    "sources": [
                        {
                            "slug": "ifs",
                            "name": "ECMWF IFS",
                            "catalog": "models",
                            "collection": "ecmwf-ifs",
                            "variable": "t2m",
                            "descriptor": "",
                            "version": ANY,
                        },
                        {
                            "slug": "wrf",
                            "name": "KMD WRF",
                            "catalog": "models",
                            "collection": "wrf-3km",
                            "variable": "t2",
                            "descriptor": "",
                            "version": ANY,
                        },
                    ],
                }
            ],
        )

    def test_a_quantity_carries_its_icon_and_a_source_its_descriptor(self):
        temperature = make_quantity("t2m", icon="thermometer")
        ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs", descriptor="9 km")
        bind(ifs, temperature, variable="t2m")

        [quantity] = self._quantities()
        self.assertEqual(quantity["icon"], "thermometer")
        self.assertEqual(quantity["sources"][0]["descriptor"], "9 km")

    def test_a_quantity_carries_the_decimals_its_place_labels_round_to(self):
        rain = make_quantity("tp", decimals=1)
        bind(make_source(make_collection("ecmwf-ifs"), slug="ifs"), rain, variable="t2m")

        [quantity] = self._quantities()
        self.assertEqual(quantity["decimals"], 1)

    def test_an_unset_icon_and_descriptor_are_blank_strings(self):
        temperature = make_quantity("t2m")
        bind(make_source(make_collection("ecmwf-ifs"), slug="ifs"), temperature, variable="t2m")

        [quantity] = self._quantities()
        self.assertEqual(quantity["icon"], "")
        self.assertEqual(quantity["sources"][0]["descriptor"], "")

    def test_each_source_carries_the_render_config_token_its_texture_urls_need(self):
        """The texture reply is immutable for a year, so the URL must change when the range does (ADR 0021)."""
        temperature = make_quantity("t2m")
        wind = make_quantity("wind10", kind=Quantity.Kind.VECTOR)
        ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs")
        bind(ifs, temperature, variable="t2m")
        bind(ifs, wind, u="10u", v="10v")
        variables = {v.slug: v for v in ifs.collection.variables.all()}

        scalar, vector = self._quantities()
        self.assertEqual(scalar["sources"][0]["version"], render_config_token(variables["t2m"]))
        expected = vector_render_config_token(variables["10u"], variables["10v"])
        self.assertEqual(vector["sources"][0]["version"], expected)

    def test_a_vector_quantity_carries_the_u_v_pair(self):
        wind = make_quantity("wind10", name="10 m wind", kind=Quantity.Kind.VECTOR)
        ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs")
        bind(ifs, wind, u="10u", v="10v")

        [quantity] = self._quantities()
        self.assertEqual(quantity["kind"], "vector")
        [source] = quantity["sources"]
        self.assertEqual((source["u"], source["v"]), ("10u", "10v"))
        self.assertNotIn("variable", source)


class CatalogueVisibilityTests(TestCase):
    """A source is offered to exactly the callers its collection is served to (ADR 0014)."""

    def setUp(self):
        dial_org(self.client)
        self.temperature = make_quantity("t2m")

    def _sources(self):
        quantities = self.client.get(reverse(URL)).json()["quantities"]
        return [source["slug"] for quantity in quantities for source in quantity["sources"]]

    def _member(self):
        user = get_user_model().objects.create_user(username="member", password="not-a-real-password")
        join_org(user)
        self.client.force_login(user)

    def _source_on(self, visibility, slug, org_slug=DEFAULT_TEST_ORG_SLUG):
        collection = make_collection(f"{slug}-collection", visibility=visibility, org_slug=org_slug)
        quantity = self.temperature if org_slug == DEFAULT_TEST_ORG_SLUG else make_quantity("t2m", org_slug=org_slug)
        bind(make_source(collection, slug=slug), quantity, variable="t2m")

    def test_a_private_source_is_absent_for_a_stranger(self):
        self._source_on("public", "open")
        self._source_on("private", "closed")
        self.assertEqual(self._sources(), ["open"])

    def test_a_private_source_is_offered_to_a_member(self):
        self._source_on("public", "open")
        self._source_on("private", "closed")
        self._member()
        self.assertEqual(sorted(self._sources()), ["closed", "open"])

    def test_an_internal_source_is_offered_to_nobody(self):
        self._source_on("internal", "hidden")
        self._member()
        self.assertEqual(self._sources(), [])

    def test_a_quantity_with_no_visible_source_is_omitted(self):
        self._source_on("private", "closed")
        self.assertEqual(self.client.get(reverse(URL)).json()["quantities"], [])

    def test_another_organisations_source_never_appears_however_it_is_named(self):
        self._source_on("public", "ifs")
        self._source_on("public", "ifs", org_slug="other-org")
        self.assertEqual(self._sources(), ["ifs"])

    def test_the_answer_is_never_shared_cached(self):
        """It varies by audience at a URL that carries none: a member's listing must not be served to a stranger."""
        self.assertEqual(self.client.get(reverse(URL))["Cache-Control"], "no-store")

    def test_an_unconfigured_organisation_answers_its_config_and_no_quantities(self):
        body = self.client.get(reverse(URL)).json()
        self.assertEqual(body["config"]["org"], DEFAULT_TEST_ORG_SLUG)
        self.assertEqual(body["config"]["org_name"], DEFAULT_TEST_ORG_SLUG)
        self.assertEqual(body["config"]["default_view"], {"center": [20.0, 0.0], "zoom": 3.0})
        self.assertEqual(body["quantities"], [])


class ShoreShadowTests(TestCase):
    """The shadow is reported only when it is both wanted and there.

    Its tiles are rendered on the server (``georiva render_shore_shadow``)
    rather than shipped, so the flag the viewer reads is the conjunction of an
    operator's choice and a fact about the disk. Reporting the choice alone
    would have the style declare a raster source with no pyramid behind it,
    which is a few hundred 404s on every pan.
    """

    def setUp(self):
        dial_org(self.client)

    def _rendered(self, root):
        """A pyramid as far as anything here can tell: z0/0/0 and nothing else."""
        tile = pyramid_in(root) / "0" / "0" / "0.png"
        tile.parent.mkdir(parents=True, exist_ok=True)
        tile.write_bytes(b"")
        return root

    def _flag(self):
        return self.client.get(reverse(URL)).json()["config"]["shore_shadow"]

    def _ask_for_it(self):
        settings = ForecastViewerSettings.for_site(Site.objects.get(hostname=org_host()))
        settings.shore_shadow = True
        settings.save()

    def test_off_by_default(self):
        """Nothing ships the tiles, so 'not asked for' is the honest default."""
        self.assertFalse(self._flag())

    def test_asked_for_but_never_rendered_is_still_off(self):
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=root):
            self._ask_for_it()
            self.assertFalse(self._flag())

    def test_asked_for_and_rendered_is_on(self):
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=self._rendered(Path(root))):
            self._ask_for_it()
            self.assertTrue(self._flag())

    def test_rendered_but_not_asked_for_is_off(self):
        """The pyramid being on disk is not consent: an operator still chooses."""
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=self._rendered(Path(root))):
            self.assertFalse(self._flag())


class PressureOverlayTests(TestCase):
    """Which sources can draw isobars, and in what unit the web must draw them.

    The web is unit-blind: the interval arrives in the texture's own unit and
    ``to_hpa`` is the one multiplication its labels need, both minted here from
    the variable's stored unit.
    """

    def setUp(self):
        dial_org(self.client)
        self.ifs = make_source(make_collection("ecmwf-ifs", variables=(*IFS_VARIABLES, "msl")), slug="ifs")

    def _sources(self):
        return {
            source["slug"]: source
            for quantity in self.client.get(reverse(URL)).json()["quantities"]
            for source in quantity["sources"]
        }

    def test_a_source_bound_to_the_pressure_quantity_carries_its_overlay_in_its_own_unit(self):
        give_unit(self.ifs.collection, "msl", "Pa")
        bind(self.ifs, make_pressure_quantity(interval_hpa=4), variable="msl")

        self.assertEqual(
            self._sources()["ifs"]["pressure"], {"variable": "msl", "interval": 400.0, "to_hpa": 0.01, "version": ANY}
        )

    def test_the_overlay_carries_its_own_variables_render_config_token(self):
        """Its texture is msl's, so its ``v=`` must be msl's token, not the token of the raster it is drawn over."""
        msl = give_unit(self.ifs.collection, "msl", "Pa")
        bind(self.ifs, make_quantity("t2m"), variable="t2m")
        bind(self.ifs, make_pressure_quantity(), variable="msl")

        listed = self._sources()["ifs"]
        self.assertEqual(listed["pressure"]["version"], render_config_token(msl))

    def test_a_source_already_in_hpa_draws_the_interval_as_set(self):
        give_unit(self.ifs.collection, "msl", "hPa")
        bind(self.ifs, make_pressure_quantity(interval_hpa=2), variable="msl")

        self.assertEqual(
            self._sources()["ifs"]["pressure"], {"variable": "msl", "interval": 2.0, "to_hpa": 1.0, "version": ANY}
        )

    def test_the_overlay_rides_on_the_source_under_every_quantity(self):
        """It is drawn over whatever raster is picked, so whichever listing the web reads must carry it."""
        give_unit(self.ifs.collection, "msl", "Pa")
        bind(self.ifs, make_quantity("t2m"), variable="t2m")
        bind(self.ifs, make_pressure_quantity(), variable="msl")

        quantities = self.client.get(reverse(URL)).json()["quantities"]
        self.assertEqual([q["slug"] for q in quantities], ["mslp", "t2m"])
        self.assertTrue(all("pressure" in q["sources"][0] for q in quantities))

    def test_no_pressure_quantity_named_means_no_overlay_anywhere(self):
        give_unit(self.ifs.collection, "msl", "Pa")
        bind(self.ifs, make_quantity("mslp"), variable="msl")

        self.assertNotIn("pressure", self._sources()["ifs"])

    def test_a_source_without_a_pressure_binding_has_no_overlay(self):
        wrf = make_source(make_collection("wrf-3km", variables=WRF_VARIABLES), slug="wrf")
        give_unit(self.ifs.collection, "msl", "Pa")
        bind(self.ifs, make_pressure_quantity(), variable="msl")
        bind(wrf, make_quantity("t2m"), variable="t2")

        self.assertNotIn("pressure", self._sources()["wrf"])

    def test_a_pressure_variable_whose_unit_is_no_pressure_loses_its_overlay_and_nothing_else(self):
        """A unit is core's to edit, after the binding was saved; the viewer degrades, the route does not fail."""
        give_unit(self.ifs.collection, "msl", "K")
        bind(self.ifs, make_pressure_quantity(), variable="msl")

        with self.assertLogs("georiva_forecast_viewer.views", level="WARNING"):
            sources = self._sources()
        self.assertEqual(sources["ifs"]["variable"], "msl")
        self.assertNotIn("pressure", sources["ifs"])
