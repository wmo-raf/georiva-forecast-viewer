"""The operator's surface: Quantities, Sources with their bindings inline, and Settings.

Nothing here previews a map or reports a run. The explorer and the runs route
cover inspection; this is where the viewer's *choices* are written down, and
it is deliberately no wider than that.

Every view narrows to the organisation the admin is served for, through
``OrgScopedViewSetMixin``: listings show its rows, a foreign pk is a 404, and
every chooser on every form — the collection on a source, the quantity and the
variables on each binding row — offers only its rows and refuses a posted id
from anyone else's. The one thing scoping cannot do is *assign* an owner, so
:class:`QuantityCreateView` does that from the host, never from a form field.

The settings page is Wagtail's own, registered beside the model: a
``BaseSiteSetting`` is per Site, and the Site is the organisation.
"""

from wagtail.admin.panels import FieldPanel, InlinePanel, MultiFieldPanel, ObjectList
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import CreateView, EditView, SnippetViewSet, SnippetViewSetGroup

from georiva.organisations.access import require_active_org
from georiva.organisations.scoping import OrgScopedViewSetMixin

from .forms import ForecastSourceForm
from .models import VARIABLE_FIELDS, ForecastSource, Quantity


class QuantityCreateView(CreateView):
    def save_instance(self):
        # The owner is the host's organisation, not a form field: offering a
        # choice would be a way to write into another institution's viewer.
        self.form.instance.organisation = require_active_org(self.request)
        return super().save_instance()


class QuantityViewSet(OrgScopedViewSetMixin, SnippetViewSet):
    model = Quantity
    icon = "list-ul"
    menu_label = "Quantities"
    list_display = ["name", "slug", "kind", "order"]
    add_view_class = QuantityCreateView
    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        FieldPanel("kind"),
        FieldPanel("icon"),
        FieldPanel("order"),
    ]


class ForecastSourceEditView(EditView):
    """Offers each binding row only the source's own variables.

    The hint half of the same-collection rule; the refusal is
    :meth:`QuantityBinding.clean` on a saved source and
    :class:`ForecastSourceForm` on the add form, where the collection is not
    known until the form is posted. Every row is narrowed, present and future:
    the formset's form *class* is what the "add another" button clones.
    """

    def get_form(self, *args, **kwargs):
        form = super().get_form(*args, **kwargs)
        own = self.object.collection.variables.all()
        formset = form.formsets["bindings"]
        for row in formset.forms:
            _offer_only(row, own)
        formset.form = type(formset.form.__name__, (formset.form,), {})
        for field in VARIABLE_FIELDS:
            formset.form.base_fields[field] = formset.form.base_fields[field].__class__(queryset=own, required=False)
        return form


def _offer_only(row, variables):
    for field in VARIABLE_FIELDS:
        row.fields[field].queryset = variables


class ForecastSourceViewSet(OrgScopedViewSetMixin, SnippetViewSet):
    model = ForecastSource
    icon = "site"
    menu_label = "Sources"
    list_display = ["name", "slug", "collection", "order"]
    edit_view_class = ForecastSourceEditView
    # An ``ObjectList`` rather than ``panels``, for the one thing only it can
    # carry: the base form class, which holds the add form's same-collection rule.
    edit_handler = ObjectList(
        [
            MultiFieldPanel(
                [
                    FieldPanel("collection"),
                    FieldPanel("name"),
                    FieldPanel("descriptor"),
                    FieldPanel("slug"),
                    FieldPanel("order"),
                ],
                heading="Source",
                help_text="Which collection holds this model's runs, and what to call it in the viewer.",
            ),
            InlinePanel(
                "bindings",
                heading="Bindings",
                label="Binding",
                help_text=(
                    "Which of this source's variables is each quantity. A scalar quantity takes one variable; "
                    "a vector quantity takes its u and v components."
                ),
                panels=[
                    FieldPanel("quantity"),
                    FieldPanel("variable"),
                    FieldPanel("u_variable"),
                    FieldPanel("v_variable"),
                ],
            ),
        ],
        base_form_class=ForecastSourceForm,
    )


class ForecastViewerGroup(SnippetViewSetGroup):
    items = (QuantityViewSet, ForecastSourceViewSet)
    menu_label = "Forecast viewer"
    menu_icon = "globe"
    menu_order = 700


register_snippet(ForecastViewerGroup)
