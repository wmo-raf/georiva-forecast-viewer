"""One organisation's forecast collection, with the variables a viewer binds."""

from georiva.core.models import Catalog, Collection, Unit, Variable
from georiva.organisations.testing import DEFAULT_TEST_ORG_SLUG, make_organisation
from georiva_forecast_viewer.models import ForecastSource, ForecastViewerSettings, Quantity, QuantityBinding

#: IFS-style slugs. A second collection uses the WRF spellings so a test can bind
#: two differently named variables to one quantity, which is the plugin's point.
IFS_VARIABLES = ("t2m", "10u", "10v")
WRF_VARIABLES = ("t2", "u10", "v10")


def make_collection(slug="ecmwf-ifs", *, variables=IFS_VARIABLES, visibility=None, org_slug=DEFAULT_TEST_ORG_SLUG):
    organisation = make_organisation(org_slug)
    catalog, _ = Catalog.objects.get_or_create(
        organisation=organisation,
        slug="models",
        defaults={"name": "Models", "file_format": "grib2"},
    )
    collection = Collection.objects.create(catalog=catalog, name=slug, slug=slug, is_forecast=True)
    if visibility is not None:
        collection.visibility = visibility
        collection.save(update_fields=["visibility"])
    unit, _ = Unit.objects.get_or_create(name="Unit", defaults={"symbol": "1"})
    for variable_slug in variables:
        Variable.objects.create(
            collection=collection, slug=variable_slug, name=variable_slug, unit=unit, value_min=-50, value_max=50
        )
    return collection


def make_quantity(slug="t2m", *, kind=Quantity.Kind.SCALAR, org_slug=DEFAULT_TEST_ORG_SLUG, **fields):
    return Quantity.objects.create(
        organisation=make_organisation(org_slug), slug=slug, name=fields.pop("name", slug), kind=kind, **fields
    )


def make_source(collection, slug="ifs", **fields):
    return ForecastSource.objects.create(collection=collection, slug=slug, name=fields.pop("name", slug), **fields)


def give_unit(collection, variable_slug, symbol):
    """Store one of the collection's variables in ``symbol``, as core's ingestion would have converted it."""
    unit, _ = Unit.objects.get_or_create(symbol=symbol, defaults={"name": symbol})
    variable = collection.variables.get(slug=variable_slug)
    variable.unit = unit
    variable.save(update_fields=["unit"])
    return variable


def make_pressure_quantity(slug="mslp", *, interval_hpa=4, org_slug=DEFAULT_TEST_ORG_SLUG):
    """A scalar quantity, named as the organisation's pressure overlay."""
    quantity = make_quantity(slug, name="Mean sea level pressure", org_slug=org_slug)
    settings = ForecastViewerSettings.for_site(make_organisation(org_slug).site)
    settings.pressure_quantity = quantity
    settings.isobar_interval_hpa = interval_hpa
    settings.save()
    return quantity


def bind(source, quantity, variable=None, u=None, v=None):
    """A binding by variable *slug*, resolved against the source's collection."""
    by_slug = {var.slug: var for var in source.collection.variables.all()}
    return QuantityBinding.objects.create(
        source=source,
        quantity=quantity,
        variable=by_slug[variable] if variable else None,
        u_variable=by_slug[u] if u else None,
        v_variable=by_slug[v] if v else None,
    )
