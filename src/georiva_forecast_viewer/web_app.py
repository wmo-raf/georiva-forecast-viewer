from django.utils.translation import gettext_lazy as _

from georiva.core.web_apps import WebApp

app = WebApp(
    slug="forecast-viewer",
    index="forecast_viewer/index.html",
    name="Forecast Viewer",
    icon="cloud-sun",
    description=_("Step through the latest forecast run on an interactive map."),
)
