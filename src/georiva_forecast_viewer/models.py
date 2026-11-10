"""What the viewer offers, as the operator declares it (wmo-raf/georiva#594).

Three rows describe one switchable thing on the map:

- A :class:`Quantity` is the *shared* thing a user selects — "2 m temperature",
  "10 m wind" — independent of which model shows it. It is the primary
  selection: the source list is filtered to the sources bound to it, which is
  only possible because the quantity is shared rather than a per-source label.
- A :class:`ForecastSource` is one model the viewer can show: one collection,
  with a name and an order. "Source" rather than "model", because Forti's
  Model is one collection × one window and this is not (ADR 0036).
- A :class:`QuantityBinding` says which of a source's variables *is* a quantity:
  one variable for a scalar, a u/v pair for a vector. IFS ``t2m`` and WRF
  ``t2`` are the same quantity through two bindings.

Everything is per organisation. A quantity carries its organisation directly;
a source is owned through its collection, like every core row; the settings
are per Site, which is the organisation (core's ``GeoRivaSettings``).
"""

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.admin.forms import WagtailAdminModelForm
from wagtail.contrib.settings.models import BaseSiteSetting, register_setting

from georiva.organisations.access import organisation_of

from .icons import validate_icon
from .pressure import hpa_per_unit

#: The three fields a binding may name a variable in.
VARIABLE_FIELDS = ("variable", "u_variable", "v_variable")

#: The same-collection refusal, worded once: the model and the source form both say it.
FOREIGN_VARIABLE = "Choose a variable from this source's collection."

#: The pressure overlay's unit refusal, from either side of the pairing.
NOT_A_PRESSURE = "The pressure overlay needs a variable stored in a pressure unit (Pa, hPa, …)."


class Quantity(models.Model):
    """A shared, source-independent thing a user can pick."""

    ORGANISATION_LOOKUP = "organisation"

    class Kind(models.TextChoices):
        SCALAR = "scalar", "Scalar (one variable)"
        VECTOR = "vector", "Vector (a u/v pair)"

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="forecast_viewer_quantities",
    )
    slug = models.SlugField(
        max_length=50,
        help_text="Stable identifier the viewer uses, e.g. 't2m' or 'wind10'.",
    )
    name = models.CharField(max_length=100, help_text="Shown to users, e.g. '2 m temperature'.")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.SCALAR)
    icon = models.CharField(
        max_length=40,
        blank=True,
        default="",
        validators=[validate_icon],
        help_text="The glyph beside the name in the viewer's list.",
    )
    #: How the map's place labels round this quantity's values. The operator's
    #: call, because the precision a forecaster reads depends on the quantity —
    #: a temperature to the degree, a rainfall to the tenth of a millimetre —
    #: and nothing EDR says about a variable carries it.
    decimals = models.PositiveSmallIntegerField(
        default=0,
        validators=[MaxValueValidator(3)],
        help_text="Decimal places in the values shown under place names on the map, e.g. 0 for '24', 1 for '0.4'.",
    )
    order = models.PositiveIntegerField(default=0, help_text="Position in the viewer's list; lower first.")

    class Meta:
        verbose_name = "quantity"
        verbose_name_plural = "quantities"
        ordering = ["order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["organisation", "slug"], name="unique_quantity_slug_per_organisation"),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        """The kind is fixed once bound: every binding of this quantity is shaped by it."""
        super().clean()
        if self.pk is None:
            return
        saved_kind = Quantity.objects.filter(pk=self.pk).values_list("kind", flat=True).first()
        if saved_kind is not None and saved_kind != self.kind and self.bindings.exists():
            raise ValidationError(
                {"kind": ValidationError("This quantity is bound; remove its bindings before changing its kind.")},
                code="bound",
            )


class ForecastSource(ClusterableModel):
    """One model the viewer can show: one collection, named and ordered."""

    ORGANISATION_LOOKUP = "collection__catalog__organisation"

    collection = models.OneToOneField(
        "georivacore.Collection",
        on_delete=models.CASCADE,
        related_name="forecast_viewer_source",
        help_text="The collection holding this model's runs.",
    )
    slug = models.SlugField(
        max_length=50,
        help_text="Stable identifier the viewer uses, e.g. 'ifs' or 'wrf'.",
    )
    name = models.CharField(max_length=100, help_text="Shown to users, e.g. 'ECMWF IFS'.")
    descriptor = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="A short tag shown beside the name, e.g. '9 km' or 'global'.",
    )
    order = models.PositiveIntegerField(default=0, help_text="Position in the viewer's list; lower first.")

    class Meta:
        verbose_name = "source"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class QuantityBinding(models.Model):
    """Which of one source's variables is one quantity."""

    ORGANISATION_LOOKUP = "source__collection__catalog__organisation"

    source = ParentalKey(ForecastSource, on_delete=models.CASCADE, related_name="bindings")
    quantity = models.ForeignKey(Quantity, on_delete=models.CASCADE, related_name="bindings")
    variable = models.ForeignKey(
        "georivacore.Variable",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        help_text="For a scalar quantity: the variable.",
    )
    u_variable = models.ForeignKey(
        "georivacore.Variable",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name="u variable",
        help_text="For a vector quantity: the eastward component.",
    )
    v_variable = models.ForeignKey(
        "georivacore.Variable",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name="v variable",
        help_text="For a vector quantity: the northward component.",
    )

    class Meta:
        verbose_name = "binding"
        constraints = [
            models.UniqueConstraint(fields=["source", "quantity"], name="unique_quantity_per_source"),
        ]

    def __str__(self):
        return f"{self.quantity} ← {self.source}"

    def clean(self):
        """A scalar is one variable, a vector is a u/v pair, and every variable is the source's own.

        The same-collection rule stands in for "same grid": one collection is one
        grid as far as the database can know, and the Titiler vector route checks
        the rasters themselves at render time. Errors land on the field that
        would have to change, chained within a field so an operator reads one
        sentence per box.
        """
        super().clean()
        errors = {}

        # The object, not ``source_id``: on the add form the rows validate
        # against a parent that has no pk yet, and an id-based guard would
        # switch every rule below off exactly when a new source is being made.
        try:
            source = self.source
        except ForecastSource.DoesNotExist:
            source = None
        collection_id = getattr(source, "collection_id", None)

        if self.quantity_id and collection_id and self.quantity.organisation_id != organisation_of(source).pk:
            errors["quantity"] = ValidationError(
                "This quantity belongs to another organisation.", code="foreign_quantity"
            )

        kind = self.quantity.kind if self.quantity_id else None
        if kind == Quantity.Kind.VECTOR:
            for component in ("u_variable", "v_variable"):
                if getattr(self, f"{component}_id") is None:
                    errors[component] = ValidationError(
                        "A vector quantity needs both components.", code="missing_component"
                    )
            if self.variable_id is not None:
                errors["variable"] = ValidationError(
                    "A vector quantity is its u/v pair; leave the variable blank.", code="scalar_on_vector"
                )
            if self.u_variable_id is not None and self.u_variable_id == self.v_variable_id:
                errors["v_variable"] = ValidationError(
                    "The two components must be different variables.", code="same_component"
                )
        elif kind == Quantity.Kind.SCALAR:
            if self.variable_id is None:
                errors["variable"] = ValidationError("A scalar quantity needs a variable.", code="missing_variable")
            for component in ("u_variable", "v_variable"):
                if getattr(self, f"{component}_id") is not None:
                    errors[component] = ValidationError(
                        "A scalar quantity is one variable; leave the components blank.", code="component_on_scalar"
                    )

        if (
            "variable" not in errors
            and self.variable_id is not None
            and self.quantity_id
            and is_pressure_overlay(self.quantity)
            and hpa_per_unit(self.variable) is None
        ):
            errors["variable"] = ValidationError(NOT_A_PRESSURE, code="not_a_pressure")

        if collection_id:
            for field in VARIABLE_FIELDS:
                if field in errors:
                    continue
                chosen = getattr(self, field)
                if chosen is not None and chosen.collection_id != collection_id:
                    errors[field] = ValidationError(FOREIGN_VARIABLE, code="foreign_variable")

        if errors:
            raise ValidationError(errors)


class ForecastViewerSettingsForm(WagtailAdminModelForm):
    """Offers the pressure overlay only this organisation's scalars.

    The settings page is Wagtail's own and not one of the org-scoped viewsets,
    so its one chooser is narrowed here: unnarrowed, it would list every
    tenant's quantity names. ``clean`` is the refusal; this is the hint.

    Narrowed by the settings row's own organisation rather than through
    ``scope_rows``, deliberately: a form has no request to scope by, and the
    row being edited *is* the organisation's — a Site setting is per Site, and
    the Site is the organisation. ``QuantityBinding.clean`` compares owners
    the same way, for the same reason.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["pressure_quantity"].queryset = Quantity.objects.filter(
            organisation=organisation_of(self.instance), kind=Quantity.Kind.SCALAR
        )


@register_setting(icon="globe")
class ForecastViewerSettings(BaseSiteSetting):
    """How the map opens: the first view. Per Site, which is the organisation.

    The basemap is not among these. The viewer ships one style of its own
    (``web/src/map/basemap.ts``) and offers no way to replace it: a style chosen
    to carry value-encoded rasters and white wind trails is part of how the
    viewer reads, not a preference.
    """

    ORGANISATION_LOOKUP = "site__organisation"

    base_form_class = ForecastViewerSettingsForm

    default_longitude = models.FloatField(default=20.0, help_text="Centre of the map when the viewer opens.")
    default_latitude = models.FloatField(default=0.0, help_text="Centre of the map when the viewer opens.")
    default_zoom = models.FloatField(default=3.0, help_text="Zoom level when the viewer opens.")
    #: The one piece of the basemap an operator may switch, because it is the
    #: one piece that is not shipped. The tiles are rendered on the machine
    #: that serves them (``georiva render_shore_shadow``), so the honest
    #: default is off: a site that has not rendered should ask for no tiles
    #: rather than 404 on every one of them. Everything else about the style
    #: stays unconfigurable, for the reason the class docstring gives.
    shore_shadow = models.BooleanField(
        default=False,
        verbose_name="Draw the shore's shadow",
        help_text=(
            "A soft dark band in the water along every shore; needs `georiva render_shore_shadow` on the server first."
        ),
    )

    #: Which quantity is mean sea level pressure, drawn as isobars and highs/lows
    #: over whatever raster is selected. A setting rather than a kind or a role
    #: on the quantity: there is at most one, and it stays an ordinary scalar
    #: the rail can still offer as a raster. Each source draws it through its
    #: own binding, as it draws wind.
    pressure_quantity = models.ForeignKey(
        Quantity,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name="Pressure overlay quantity",
        help_text=(
            "The scalar quantity drawn as isobars and highs/lows over any map. "
            "Every variable bound to it must be stored in a pressure unit."
        ),
    )
    isobar_interval_hpa = models.FloatField(
        default=4.0,
        validators=[MinValueValidator(0.5)],
        verbose_name="Isobar interval (hPa)",
        help_text="Spacing between isobars. 4 hPa is the synoptic convention; 2 hPa suits the tropics.",
    )

    class Meta:
        verbose_name = "Forecast viewer settings"

    def clean(self):
        """The overlay is one of this organisation's scalars, and every variable bound to it is a pressure.

        The binding refuses a non-pressure variable once the quantity is named
        here; this is the other order, a quantity already bound being named.
        """
        super().clean()
        quantity = self.pressure_quantity
        if quantity is None:
            return
        if quantity.organisation_id != getattr(organisation_of(self), "pk", None):
            problem = "This quantity belongs to another organisation."
        elif quantity.kind != Quantity.Kind.SCALAR:
            problem = "Isobars are drawn from one variable; choose a scalar quantity."
        else:
            strays = [
                f"{binding.source} ({binding.variable})"
                for binding in quantity.bindings.select_related("source", "variable__unit")
                if binding.variable is not None and hpa_per_unit(binding.variable) is None
            ]
            problem = f"{NOT_A_PRESSURE} Not one: {', '.join(strays)}." if strays else None
        if problem:
            raise ValidationError({"pressure_quantity": ValidationError(problem, code="not_a_pressure_overlay")})


def is_pressure_overlay(quantity):
    """Whether ``quantity`` is the one its organisation draws as isobars.

    Asked of the settings table rather than a Site: a quantity is named only by
    its own organisation's settings, which refuse anyone else's, so any row
    naming it is the right one — and asking creates nothing.
    """
    return ForecastViewerSettings.objects.filter(pressure_quantity=quantity).exists()
