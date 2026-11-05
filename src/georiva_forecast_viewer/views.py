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

from django.conf import settings as django_settings
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from georiva.core.machine_plane.addresses import render_config_token, vector_render_config_token
from georiva.core.models import Collection
from georiva.organisations.access import require_active_org
from georiva.organisations.ownership import scope_rows

from .models import ForecastViewerSettings, QuantityBinding
from .pyramid import is_rendered, pyramid_in


def describe_config(organisation):
    settings = ForecastViewerSettings.for_site(organisation.site)
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


def describe_quantities(request):
    """Quantities in their order, each with its sources in theirs."""
    by_quantity = {}
    for binding in visible_bindings(request).order_by(
        "quantity__order", "quantity__name", "source__order", "source__name"
    ):
        quantity = binding.quantity
        entry = by_quantity.setdefault(
            quantity.pk,
            {"slug": quantity.slug, "name": quantity.name, "kind": quantity.kind, "icon": quantity.icon, "sources": []},
        )
        entry["sources"].append(describe_source(binding))
    return list(by_quantity.values())


class CatalogueView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        organisation = require_active_org(request)
        response = Response({"config": describe_config(organisation), "quantities": describe_quantities(request)})
        # Varies by audience at a URL that carries none (members see private
        # sources), so no cache between here and a browser may share it (ADR 0029).
        response["Cache-Control"] = "no-store"
        return response
