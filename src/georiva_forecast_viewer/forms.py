"""The source form: the one rule a row cannot check on its own.

A binding row validates as a bare instance with no parent attached, so on the
add form :meth:`QuantityBinding.clean` cannot see which collection the source
is about to have. The form holds both halves — the posted collection and the
posted rows — so the same-collection rule is restated here and lands on the
row's field, in the model's own words.
"""

from wagtail.admin.forms import WagtailAdminModelForm

from .models import FOREIGN_VARIABLE, VARIABLE_FIELDS


class ForecastSourceForm(WagtailAdminModelForm):
    def is_valid(self):
        valid = super().is_valid()
        collection = self.cleaned_data.get("collection") if hasattr(self, "cleaned_data") else None
        if collection is None:
            return valid
        for row in self.formsets["bindings"].forms:
            if not row.is_valid() or row.cleaned_data.get("DELETE"):
                continue
            for field in VARIABLE_FIELDS:
                chosen = row.cleaned_data.get(field)
                if chosen is not None and chosen.collection_id != collection.pk:
                    row.add_error(field, FOREIGN_VARIABLE)
                    valid = False
        return valid
