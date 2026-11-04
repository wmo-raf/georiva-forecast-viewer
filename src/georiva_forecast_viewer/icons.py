"""The curated icon set a quantity may be drawn with.

One list, in ``icons.json`` beside this module, read by both halves: the admin
offers exactly these names, and the web's test asserts that every name has a
glyph. A name is a stable identifier, never a file path, so the web is free to
change which library draws it.
"""

import json
from pathlib import Path

from django.core.exceptions import ValidationError

ICON_NAMES: tuple[str, ...] = tuple(json.loads((Path(__file__).parent / "icons.json").read_text(encoding="utf-8")))

ICON_CHOICES = [("", "None")] + [(name, name.replace("-", " ")) for name in ICON_NAMES]


def validate_icon(value):
    """A validator rather than field ``choices``: choices are baked into migrations, so
    adding a glyph to ``icons.json`` would need one every time. The admin's dropdown
    offers the same list through its widget."""
    if value and value not in ICON_NAMES:
        raise ValidationError(f"'{value}' is not one of the viewer's icons.", code="unknown_icon")
