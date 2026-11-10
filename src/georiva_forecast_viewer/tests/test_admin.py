"""The operator's three pages: quantities, sources with their bindings, settings.

Two things are asserted about every page that takes a choice: it offers only
this organisation's rows, and a posted id from another organisation is refused
without being explained. A row created here belongs to the organisation the
admin is served for, never to one the operator picked.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from georiva.organisations.testing import dial_org, join_org
from georiva_forecast_viewer.models import ForecastSource, Quantity

from .factories import make_collection, make_quantity, make_source

QUANTITY = "wagtailsnippets_georiva_forecast_viewer_quantity"
SOURCE = "wagtailsnippets_georiva_forecast_viewer_forecastsource"


def sign_in_superuser(client, username="root"):
    user = get_user_model().objects.create_user(
        username=username, password="not-a-real-password", is_staff=True, is_superuser=True
    )
    join_org(user)
    client.force_login(user)
    return user


def bindings_payload(*rows):
    """The inline panel's formset, as the browser posts it."""
    payload = {
        "bindings-TOTAL_FORMS": str(len(rows)),
        "bindings-INITIAL_FORMS": "0",
        "bindings-MIN_NUM_FORMS": "0",
        "bindings-MAX_NUM_FORMS": "1000",
    }
    for index, row in enumerate(rows):
        payload[f"bindings-{index}-id"] = ""
        for field in ("quantity", "variable", "u_variable", "v_variable"):
            value = row.get(field)
            payload[f"bindings-{index}-{field}"] = str(value.pk) if value is not None else ""
    return payload


class QuantityAdminTests(TestCase):
    def setUp(self):
        dial_org(self.client)
        sign_in_superuser(self.client)

    def test_a_quantity_created_here_belongs_to_this_organisation(self):
        response = self.client.post(
            reverse(f"{QUANTITY}:add"),
            {"slug": "t2m", "name": "2 m temperature", "kind": "scalar", "decimals": "0", "order": "0"},
        )
        if response.status_code == 200:
            self.fail(f"form did not save: {response.context['form'].errors}")
        self.assertEqual(Quantity.objects.get(slug="t2m").organisation.slug, "test-org")

    def test_the_form_offers_no_organisation_choice(self):
        response = self.client.get(reverse(f"{QUANTITY}:add"))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'name="organisation"')

    def test_the_listing_shows_only_this_organisations_quantities(self):
        make_quantity("t2m", name="Ours")
        make_quantity("t2m", name="Theirs", org_slug="other-org")
        response = self.client.get(reverse(f"{QUANTITY}:list"))
        self.assertContains(response, "Ours")
        self.assertNotContains(response, "Theirs")

    def test_another_organisations_quantity_is_not_reachable(self):
        theirs = make_quantity("t2m", org_slug="other-org")
        self.assertEqual(self.client.get(reverse(f"{QUANTITY}:edit", args=[theirs.pk])).status_code, 404)


class SourceAdminTests(TestCase):
    def setUp(self):
        dial_org(self.client)
        sign_in_superuser(self.client)
        self.collection = make_collection("ecmwf-ifs")
        self.temperature = make_quantity("t2m")

    def _offered(self, response, field, prefix=None):
        form = response.context["form"]
        if prefix:
            form = form.formsets[prefix].empty_form
        return [value.value for value, _label in form.fields[field].choices if value]

    def test_a_source_is_created_with_its_bindings_in_one_post(self):
        t2m = self.collection.variables.get(slug="t2m")
        response = self.client.post(
            reverse(f"{SOURCE}:add"),
            {
                "collection": str(self.collection.pk),
                "slug": "ifs",
                "name": "ECMWF IFS",
                "order": "0",
                **bindings_payload({"quantity": self.temperature, "variable": t2m}),
            },
        )
        if response.status_code == 200:
            self.fail(f"form did not save: {response.context['form'].errors}")
        source = ForecastSource.objects.get(slug="ifs")
        [binding] = source.bindings.all()
        self.assertEqual((binding.quantity, binding.variable), (self.temperature, t2m))

    def test_a_malformed_binding_is_refused_on_its_row(self):
        response = self.client.post(
            reverse(f"{SOURCE}:add"),
            {
                "collection": str(self.collection.pk),
                "slug": "ifs",
                "name": "ECMWF IFS",
                "order": "0",
                **bindings_payload({"quantity": self.temperature}),
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(ForecastSource.objects.exists())
        row_errors = response.context["form"].formsets["bindings"].errors[0]
        self.assertIn("variable", row_errors)

    def test_a_variable_from_another_collection_is_refused_on_a_new_source(self):
        """The parent is unsaved when its rows validate, which must not switch the rule off."""
        other = make_collection("wrf-3km", variables=("t2",))
        response = self.client.post(
            reverse(f"{SOURCE}:add"),
            {
                "collection": str(self.collection.pk),
                "slug": "ifs",
                "name": "ECMWF IFS",
                "order": "0",
                **bindings_payload({"quantity": self.temperature, "variable": other.variables.get(slug="t2")}),
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(ForecastSource.objects.exists())
        self.assertIn("variable", response.context["form"].formsets["bindings"].errors[0])

    def test_a_saved_source_offers_only_its_own_collections_variables(self):
        make_collection("wrf-3km", variables=("t2",))
        source = make_source(self.collection, slug="ifs")
        response = self.client.get(reverse(f"{SOURCE}:edit", args=[source.pk]))
        self.assertEqual(response.status_code, 200)
        mine = sorted(self.collection.variables.values_list("pk", flat=True))
        for field in ("variable", "u_variable", "v_variable"):
            self.assertEqual(sorted(self._offered(response, field, prefix="bindings")), mine)

    def test_only_this_organisations_collections_and_quantities_are_offered(self):
        theirs = make_collection("ecmwf-ifs", org_slug="other-org")
        their_quantity = make_quantity("t2m", org_slug="other-org")
        response = self.client.get(reverse(f"{SOURCE}:add"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._offered(response, "collection"), [self.collection.pk])
        self.assertNotIn(theirs.pk, self._offered(response, "collection"))
        self.assertEqual(self._offered(response, "quantity", prefix="bindings"), [self.temperature.pk])
        self.assertNotIn(their_quantity.pk, self._offered(response, "quantity", prefix="bindings"))

    def test_a_posted_foreign_collection_is_refused(self):
        theirs = make_collection("ecmwf-ifs", org_slug="other-org")
        response = self.client.post(
            reverse(f"{SOURCE}:add"),
            {"collection": str(theirs.pk), "slug": "ifs", "name": "Theirs", "order": "0", **bindings_payload()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(ForecastSource.objects.exists())
        self.assertIn("collection", response.context["form"].errors)

    def test_another_organisations_source_is_not_reachable(self):
        theirs = make_source(make_collection("ecmwf-ifs", org_slug="other-org"))
        self.assertEqual(self.client.get(reverse(f"{SOURCE}:edit", args=[theirs.pk])).status_code, 404)


class SettingsAdminTests(TestCase):
    def setUp(self):
        dial_org(self.client)
        sign_in_superuser(self.client)

    def test_the_settings_page_opens_for_this_organisation(self):
        url = reverse("wagtailsettings:edit", args=["georiva_forecast_viewer", "forecastviewersettings"])
        self.assertEqual(self.client.get(url, follow=True).status_code, 200)

    def test_the_pressure_overlay_is_chosen_from_this_organisations_scalars_only(self):
        mslp = make_quantity("mslp")
        make_quantity("wind10", kind=Quantity.Kind.VECTOR)
        make_quantity("theirs", org_slug="other-org")
        url = reverse("wagtailsettings:edit", args=["georiva_forecast_viewer", "forecastviewersettings"])

        form = self.client.get(url, follow=True).context["form"]

        self.assertEqual(list(form.fields["pressure_quantity"].queryset), [mslp])
