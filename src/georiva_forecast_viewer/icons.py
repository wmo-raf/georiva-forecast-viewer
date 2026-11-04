"""The curated icon set a quantity may be drawn with.

One list, in ``icons.json`` beside this module, read by both halves: the admin
offers exactly these names, and the web's test asserts that every name has a
glyph. A name is a stable identifier, never a file path, so the web is free to
change which library draws it.
"""

import json
from pathlib import Path

ICON_NAMES: tuple[str, ...] = tuple(json.loads((Path(__file__).parent / "icons.json").read_text(encoding="utf-8")))

ICON_CHOICES = [("", "None")] + [(name, name.replace("-", " ")) for name in ICON_NAMES]
