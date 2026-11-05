from django.apps import AppConfig


class GeorivaForecastViewerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "georiva_forecast_viewer"
    verbose_name = "GeoRiva Forecast Viewer"

    def ready(self):
        from . import checks  # noqa: F401  (registers georiva_forecast_viewer.W001)
