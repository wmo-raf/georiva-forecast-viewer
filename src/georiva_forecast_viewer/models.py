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
from django.db import models
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.contrib.settings.models import BaseSiteSetting, register_setting


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

        if self.quantity_id and self.source_id:
            if self.quantity.organisation_id != self.source.collection.catalog.organisation_id:
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

        if self.source_id:
            for field in ("variable", "u_variable", "v_variable"):
                if field in errors:
                    continue
                chosen = getattr(self, field)
                if chosen is not None and chosen.collection_id != self.source.collection_id:
                    errors[field] = ValidationError(
                        "Choose a variable from this source's collection.", code="foreign_variable"
                    )

        if errors:
            raise ValidationError(errors)


@register_setting(icon="globe")
class ForecastViewerSettings(BaseSiteSetting):
    """How the map opens: the basemap and the first view. Per Site, which is the organisation."""

    ORGANISATION_LOOKUP = "site__organisation"

    basemap_style_url = models.URLField(
        blank=True,
        help_text="A MapLibre style JSON URL. Leave blank for the viewer's built-in default.",
    )
    default_longitude = models.FloatField(default=20.0, help_text="Centre of the map when the viewer opens.")
    default_latitude = models.FloatField(default=0.0, help_text="Centre of the map when the viewer opens.")
    default_zoom = models.FloatField(default=3.0, help_text="Zoom level when the viewer opens.")

    class Meta:
        verbose_name = "Forecast viewer settings"
