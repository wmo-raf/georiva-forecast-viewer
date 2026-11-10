"""``GET /api/forecast-viewer/`` — everything the web bundle needs on load, in one body.

``config`` and ``quantities`` travel together because nothing in the viewer
wants one without the other, and a second round trip before the map can draw
buys nothing.

The tenant boundary is one queryset, :func:`visible_bindings`: the active
organisation's bindings whose collection this caller may be served. A source
on a collection the caller may not see is simply absent — a listing cannot be
used to enumerate what a tenant keeps private — and a quantity with no visible
source is absent with it, so the viewer never offers a choice that leads
nowhere.
"""

import logging

from django.conf import settings as django_settings
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from georiva.core.machine_plane.addresses import render_config_token, vector_render_config_token
from georiva.core.models import Collection
from georiva.organisations.access import require_active_org
from georiva.organisations.ownership import scope_rows

from .models import ForecastSource, ForecastViewerSettings, QuantityBinding
from .pressure import describe_pressure
from .pyramid import is_rendered, pyramid_in

logger = logging.getLogger(__name__)


def describe_config(organisation, settings):
    return {
        "org": organisation.slug,
        "org_name": organisation.name,
        "default_view": {
            "center": [settings.default_longitude, settings.default_latitude],
            "zoom": settings.default_zoom,
        },
        "shore_shadow": shore_shadow_available(settings),
    }


def shore_shadow_available(settings):
    """Whether the viewer should draw the shadow: asked for, and actually there.

    The tiles are rendered on the server rather than shipped
    (``georiva render_shore_shadow``), so "the operator ticked the box" and
    "the pyramid exists" are two different facts and the viewer needs both.
    Reporting the first alone would have the style request several hundred
    tiles that 404.

    The check is one ``stat``, on a request that already runs several queries,
    and it is not cached: a pyramid rendered a minute ago should show up on
    the next reload rather than after a restart or a TTL — which is precisely
    the moment someone is reloading to find out whether the render worked.
    """
    if not settings.shore_shadow:
        return False
    return is_rendered(pyramid_in(django_settings.STATIC_ROOT)) if django_settings.STATIC_ROOT else False


def describe_weather(request, settings):
    """The Weather layer: the operator's label and opening choice, and who can draw it.

    The sources are those this caller may be served that name a symbols model,
    in source order — the same visibility rule as the bindings, applied to the
    sources directly, since a source draws Weather whatever quantities it binds.
    """
    sources = scope_rows(
        request,
        ForecastSource.objects.filter(collection__in=Collection.objects.visible_to(request)).exclude(symbols_model=""),
    ).select_related("collection__catalog")
    return {
        "label": settings.weather_label,
        "opens": settings.weather_opens,
        "sources": [
            {
                "slug": source.slug,
                "name": source.name,
                "descriptor": source.descriptor,
                "catalog": source.collection.catalog.slug,
                "collection": source.collection.slug,
                "symbols_model": source.symbols_model,
            }
            for source in sources.order_by("order", "name")
        ],
    }


def visible_bindings(request):
    """This organisation's bindings on collections ``request`` may be served."""
    bindings = QuantityBinding.objects.filter(source__collection__in=Collection.objects.visible_to(request))
    return scope_rows(request, bindings).select_related(
        "quantity",
        "source__collection__catalog",
        # The token reads each variable's collection and catalog (ADR 0038's clip mode).
        "variable__collection__catalog",
        "u_variable__collection__catalog",
        "v_variable__collection__catalog",
    )


def describe_source(binding):
    source = binding.source
    described = {
        "slug": source.slug,
        "name": source.name,
        "descriptor": source.descriptor,
        "symbols_model": source.symbols_model,
        "catalog": source.collection.catalog.slug,
        "collection": source.collection.slug,
    }
    # ``version`` is core's render-config token, the ``v=`` a texture URL must
    # carry: the reply is immutable for a year, and only the token makes an
    # edit to the variable's range or clipping a *different* URL (ADR 0021).
    # Minted here, in process, because the web may not spell it (ADR 0013).
    if binding.quantity.kind == binding.quantity.Kind.VECTOR:
        described["u"] = binding.u_variable.slug
        described["v"] = binding.v_variable.slug
        described["version"] = vector_render_config_token(binding.u_variable, binding.v_variable)
    else:
        described["variable"] = binding.variable.slug
        described["version"] = render_config_token(binding.variable)
    return described


def pressure_by_source(request, settings):
    """Each visible source's pressure overlay, by source pk, for those that can draw one.

    A source is absent when it has no binding to the pressure quantity, or when
    that binding's variable is not stored in a pressure unit. The admin refuses
    the second, but a variable's unit is core's to edit and can change under a
    binding already saved; the viewer then loses the overlay for that model
    rather than the whole catalogue failing, and the log says why.
    """
    if settings.pressure_quantity_id is None:
        return {}
    overlays = {}
    for binding in (
        visible_bindings(request).filter(quantity_id=settings.pressure_quantity_id).select_related("variable__unit")
    ):
        described = describe_pressure(binding.variable, settings.isobar_interval_hpa)
        if described is None:
            logger.warning(
                "Forecast viewer: %s's pressure variable %s is not stored in a pressure unit; no isobars for it.",
                binding.source,
                binding.variable,
            )
            continue
        overlays[binding.source_id] = described
    return overlays


def describe_quantities(request, settings):
    """Quantities in their order, each with its sources in theirs."""
    by_quantity = {}
    pressure = pressure_by_source(request, settings)
    for binding in visible_bindings(request).order_by(
        "quantity__order", "quantity__name", "source__order", "source__name"
    ):
        quantity = binding.quantity
        entry = by_quantity.setdefault(
            quantity.pk,
            {
                "slug": quantity.slug,
                "name": quantity.name,
                "kind": quantity.kind,
                "icon": quantity.icon,
                "decimals": quantity.decimals,
                "sources": [],
            },
        )
        described = describe_source(binding)
        # On every listing of the source, not on one quantity: the overlay is
        # drawn over whichever quantity is selected, as wind is.
        if binding.source_id in pressure:
            described["pressure"] = pressure[binding.source_id]
        entry["sources"].append(described)
    return list(by_quantity.values())


class CatalogueView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        organisation = require_active_org(request)
        # Read once: the config and the pressure overlays both come from it.
        settings = ForecastViewerSettings.for_site(organisation.site)
        response = Response(
            {
                "config": describe_config(organisation, settings),
                "quantities": describe_quantities(request, settings),
                "weather": describe_weather(request, settings),
            }
        )
        # Varies by audience at a URL that carries none (members see private
        # sources), so no cache between here and a browser may share it (ADR 0029).
        response["Cache-Control"] = "no-store"
        return response
