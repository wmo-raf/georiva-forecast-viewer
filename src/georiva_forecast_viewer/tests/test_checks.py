"""The check that catches the one half-done deployment this plugin allows.

The shadow's tiles are rendered on the server, by a command nothing runs for
you, so "switched on" and "actually there" can disagree — and when they do
the map just draws without the band, which looks like a styling choice. The
check is the only thing that says otherwise.
"""

from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import TestCase, override_settings
from wagtail.models import Site

from georiva.organisations.testing import make_organisation, org_host

from ..checks import shore_shadow_is_rendered
from ..models import ForecastViewerSettings
from ..pyramid import pyramid_in


class ShoreShadowCheckTests(TestCase):
    def setUp(self):
        make_organisation()

    def _ask_for_it(self):
        settings = ForecastViewerSettings.for_site(Site.objects.get(hostname=org_host()))
        settings.shore_shadow = True
        settings.save()

    def _rendered(self, root: Path) -> Path:
        tile = pyramid_in(root) / "0" / "0" / "0.png"
        tile.parent.mkdir(parents=True, exist_ok=True)
        tile.write_bytes(b"")
        return root

    def test_silent_when_nobody_asked_for_the_shadow(self):
        """An unrendered pyramid is not a problem until an organisation wants one."""
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=root):
            self.assertEqual(shore_shadow_is_rendered(None), [])

    def test_warns_when_asked_for_and_missing(self):
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=root):
            self._ask_for_it()
            [warning] = shore_shadow_is_rendered(None)
            self.assertEqual(warning.id, "georiva_forecast_viewer.W001")
            self.assertIn("render_shore_shadow", warning.hint)

    def test_silent_once_rendered(self):
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=self._rendered(Path(root))):
            self._ask_for_it()
            self.assertEqual(shore_shadow_is_rendered(None), [])

    def test_a_warning_and_not_an_error(self):
        """A missing basemap flourish must never be what stops a forecast server."""
        with TemporaryDirectory() as root, override_settings(STATIC_ROOT=root):
            self._ask_for_it()
            [warning] = shore_shadow_is_rendered(None)
            self.assertFalse(warning.is_serious())
