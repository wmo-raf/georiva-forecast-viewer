"""The one route this plugin contributes under ``/api/`` (core's ADR 0028).

Not ``forecast/``, which ``georiva-publisher-forti`` owns. The path carries no
package name: a public route is a contract with the web bundle and with anybody
else's client, not a place to write down our packaging.
"""

from django.urls import path

from .views import CatalogueView

app_name = "georiva_forecast_viewer"

urlpatterns = [
    path("forecast-viewer/", CatalogueView.as_view(), name="catalogue"),
]
