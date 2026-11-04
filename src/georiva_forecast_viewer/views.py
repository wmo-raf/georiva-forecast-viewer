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

from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from georiva.core.models import Collection
from georiva.organisations.access import require_active_org
from georiva.organisations.ownership import scope_rows

from .models import ForecastViewerSettings, QuantityBinding


def describe_config(organisation):
    settings = ForecastViewerSettings.for_site(organisation.site)
    return {
        "org": organisation.slug,
        "basemap_style": settings.basemap_style_url or None,
        "default_view": {
            "center": [settings.default_longitude, settings.default_latitude],
            "zoom": settings.default_zoom,
        },
    }


def visible_bindings(request):
    """This organisation's bindings on collections ``request`` may be served."""
    bindings = QuantityBinding.objects.filter(source__collection__in=Collection.objects.visible_to(request))
    return scope_rows(request, bindings).select_related(
        "quantity",
        "source__collection__catalog",
        "variable",
        "u_variable",
        "v_variable",
    )


def describe_source(binding):
    source = binding.source
    described = {
        "slug": source.slug,
        "name": source.name,
        "catalog": source.collection.catalog.slug,
        "collection": source.collection.slug,
    }
    if binding.quantity.kind == binding.quantity.Kind.VECTOR:
        described["u"] = binding.u_variable.slug
        described["v"] = binding.v_variable.slug
    else:
        described["variable"] = binding.variable.slug
    return described


def describe_quantities(request):
    """Quantities in their order, each with its sources in theirs."""
    by_quantity = {}
    for binding in visible_bindings(request).order_by(
        "quantity__order", "quantity__name", "source__order", "source__name"
    ):
        quantity = binding.quantity
        entry = by_quantity.setdefault(
            quantity.pk,
            {"slug": quantity.slug, "name": quantity.name, "kind": quantity.kind, "sources": []},
        )
        entry["sources"].append(describe_source(binding))
    return list(by_quantity.values())


class CatalogueView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        organisation = require_active_org(request)
        return Response({"config": describe_config(organisation), "quantities": describe_quantities(request)})
