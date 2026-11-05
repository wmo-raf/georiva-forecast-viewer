"""The one thing about this plugin a deployment can get half-done.

Everything else the viewer needs either ships with it or is a row an operator
creates and can see. The shore shadow is neither: it is 55 MB of tiles that
are rendered on the machine serving them, by a command nothing runs
automatically (core's ADR 0035 forbids install hooks). So it is possible to
tick the box and have no shadow, and the failure is silent — the map simply
draws without the band, which looks like a styling choice rather than a
missing step.

A warning, not an error. The viewer works without the shadow; it just reads
less well, and refusing to start over a cosmetic layer would take a working
forecast map down for a basemap flourish.
"""

from __future__ import annotations

from django.conf import settings as django_settings
from django.core.checks import Warning, register

from .pyramid import is_rendered, pyramid_in


@register()
def shore_shadow_is_rendered(app_configs, **kwargs):
    """Name any organisation that asked for the shadow and has no tiles."""
    if app_configs is not None and not any(config.name == "georiva_forecast_viewer" for config in app_configs):
        return []

    from .models import ForecastViewerSettings

    try:
        asked = list(ForecastViewerSettings.objects.filter(shore_shadow=True).select_related("site__organisation"))
    except Exception:
        # No database yet, or no table yet: `migrate` is itself a management
        # command and runs the checks, so this must not be the thing that
        # stops it.
        return []

    if not asked or is_rendered(pyramid_in(django_settings.STATIC_ROOT or "")):
        return []

    names = ", ".join(sorted(str(setting.site) for setting in asked)) or "an organisation"
    return [
        Warning(
            f"The forecast viewer's shore shadow is switched on for {names}, but its tiles "
            "have not been rendered, so the viewer is drawing no shadow.",
            hint=(
                "Run `georiva render_shore_shadow` on this server (about 8 minutes). "
                "See docs/shore-shadow.md in the georiva-forecast-viewer plugin."
            ),
            id="georiva_forecast_viewer.W001",
        )
    ]
