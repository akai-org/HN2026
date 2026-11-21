"""Text helpers shared by the extractors (blocks B1-B3)."""

import re

from hacknation_2026.contracts import Block

BOX = "☐"
# Empty checkbox glyphs: Wingdings o/¨/q (  ), SymbolMT  (form 9), ❑ ☐ □.
BOX_GLYPHS = "❑☐□"
# Symbol-font glyphs in the Private Use Area that mean a list bullet, e.g. Wingdings arrow ⇨ (, form 3).
BULLET_GLYPHS = ""

_BLANK_RUN = re.compile(r"(?:[.…_]\s?){4,}")
_SPACES = re.compile(r"[ \t ]+")
_PRIVATE_USE = re.compile(r"[-]")


def normalize(text: str) -> str:
  """Collapse fill-in dots/underscores to `____`, unify checkbox/bullet glyphs and whitespace."""
  for glyph in BOX_GLYPHS:
    text = text.replace(glyph, BOX)
  for glyph in BULLET_GLYPHS:
    text = text.replace(glyph, "-")
  text = _PRIVATE_USE.sub("•", text)   # any other symbol-font glyph is unreadable for the LLM
  text = _BLANK_RUN.sub(" ____ ", text)
  return _SPACES.sub(" ", text).strip()


def line_block(text: str, page: int) -> Block | None:
  """Normalized line -> checkbox block (one leading box) or text block (boxes inline as `[ ]`)."""
  text = normalize(text)
  if not text:
    return None
  if text.count(BOX) == 1 and text.startswith(BOX):
    return Block(kind="checkbox", text=text[1:].strip(), checked=False, page=page)
  return Block(kind="text", text=text.replace(BOX, "[ ]"), page=page)
