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

from wagtail.admin.panels import FieldPanel, InlinePanel, MultiFieldPanel
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import CreateView, SnippetViewSet, SnippetViewSetGroup

from georiva.organisations.access import require_active_org
from georiva.organisations.scoping import OrgScopedViewSetMixin

from .models import ForecastSource, Quantity


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
        FieldPanel("order"),
    ]


class ForecastSourceViewSet(OrgScopedViewSetMixin, SnippetViewSet):
    model = ForecastSource
    icon = "site"
    menu_label = "Sources"
    list_display = ["name", "slug", "collection", "order"]
    panels = [
        MultiFieldPanel(
            [
                FieldPanel("collection"),
                FieldPanel("name"),
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
    ]


class ForecastViewerGroup(SnippetViewSetGroup):
    items = (QuantityViewSet, ForecastSourceViewSet)
    menu_label = "Forecast viewer"
    menu_icon = "globe"
    menu_order = 700


register_snippet(ForecastViewerGroup)
