"""What a binding refuses, so the catalogue never hands the web a half-made source.

A scalar quantity has one variable and a vector has a u/v pair; the other
fields are empty. Every variable is the source's own collection's: that is the
same grid as far as the database can know, and the Titiler vector route
re-checks the rasters themselves at render time.
"""

from django.core.exceptions import ValidationError
from django.test import TestCase

from georiva_forecast_viewer.models import ForecastSource, Quantity, QuantityBinding

from .factories import WRF_VARIABLES, make_collection, make_quantity, make_source


class BindingValidationTests(TestCase):
    def setUp(self):
        self.ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs")
        self.variables = {v.slug: v for v in self.ifs.collection.variables.all()}
        self.temperature = make_quantity("t2m")
        self.wind = make_quantity("wind10", kind=Quantity.Kind.VECTOR)

    def _binding(self, quantity, **fields):
        return QuantityBinding(source=self.ifs, quantity=quantity, **fields)

    def assertRefused(self, binding, *fields):
        with self.assertRaises(ValidationError) as caught:
            binding.full_clean()
        self.assertEqual(sorted(caught.exception.message_dict), sorted(fields))

    def test_a_scalar_binding_is_its_variable(self):
        self._binding(self.temperature, variable=self.variables["t2m"]).full_clean()

    def test_a_scalar_binding_without_a_variable_is_refused(self):
        self.assertRefused(self._binding(self.temperature), "variable")

    def test_a_scalar_binding_does_not_carry_components(self):
        binding = self._binding(self.temperature, variable=self.variables["t2m"], u_variable=self.variables["10u"])
        self.assertRefused(binding, "u_variable")

    def test_a_vector_binding_is_its_pair(self):
        self._binding(self.wind, u_variable=self.variables["10u"], v_variable=self.variables["10v"]).full_clean()

    def test_a_vector_binding_needs_both_components(self):
        self.assertRefused(self._binding(self.wind, u_variable=self.variables["10u"]), "v_variable")

    def test_a_vector_binding_does_not_carry_a_scalar_variable(self):
        binding = self._binding(
            self.wind,
            u_variable=self.variables["10u"],
            v_variable=self.variables["10v"],
            variable=self.variables["t2m"],
        )
        self.assertRefused(binding, "variable")

    def test_the_two_components_are_different_variables(self):
        binding = self._binding(self.wind, u_variable=self.variables["10u"], v_variable=self.variables["10u"])
        self.assertRefused(binding, "v_variable")

    def test_a_variable_from_another_collection_is_refused(self):
        wrf = make_collection("wrf-3km", variables=WRF_VARIABLES)
        foreign = wrf.variables.get(slug="t2")
        self.assertRefused(self._binding(self.temperature, variable=foreign), "variable")

    def test_a_quantity_from_another_organisation_is_refused(self):
        foreign = make_quantity("t2m", org_slug="other-org")
        self.assertRefused(self._binding(foreign, variable=self.variables["t2m"]), "quantity")

    def test_an_unsaved_source_still_refuses_a_foreign_variable(self):
        """On the add form the parent has no pk yet; the rule must read the object, not the id."""
        wrf = make_collection("wrf-3km", variables=WRF_VARIABLES)
        unsaved = ForecastSource(collection=self.ifs.collection, slug="new", name="New")
        binding = QuantityBinding(source=unsaved, quantity=self.temperature, variable=wrf.variables.get(slug="t2"))
        # ``source`` excluded as the inline formset excludes it: an unsaved parent
        # fails the field's own check, which is not the rule under test.
        with self.assertRaises(ValidationError) as caught:
            binding.full_clean(exclude=["source"])
        self.assertEqual(list(caught.exception.message_dict), ["variable"])


class QuantityKindTests(TestCase):
    """A quantity's kind is fixed once bound: its bindings are shaped by it."""

    def test_the_kind_cannot_change_while_bindings_exist(self):
        ifs = make_source(make_collection("ecmwf-ifs"), slug="ifs")
        temperature = make_quantity("t2m")
        t2m = ifs.collection.variables.get(slug="t2m")
        QuantityBinding.objects.create(source=ifs, quantity=temperature, variable=t2m)
        temperature.kind = Quantity.Kind.VECTOR
        with self.assertRaises(ValidationError) as caught:
            temperature.full_clean()
        self.assertIn("kind", caught.exception.message_dict)

    def test_the_kind_can_change_while_nothing_is_bound(self):
        temperature = make_quantity("t2m")
        temperature.kind = Quantity.Kind.VECTOR
        temperature.full_clean()
