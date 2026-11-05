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

from .factories import WRF_VARIABLES, bind, make_collection, make_quantity, make_source

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
