"""Grid layout and node construction: every section and field gets the full key set of the reference outputs."""

import html
import re
import unicodedata
import uuid
from typing import Any

COLS = 3
EMPTY_HTML = "<html><head></head><body></body></html>"
CHOICE_TYPES = {"RADIO", "CHECKBOX", "SELECT"}

_POLISH = str.maketrans({"ł": "l", "Ł": "L"})


def slug(text: str, fallback: str = "pole") -> str:
  """snake_case ASCII from a Polish label: 'Adres e-mail' -> 'adres_e_mail'."""
  ascii_text = unicodedata.normalize("NFKD", text.translate(_POLISH)).encode("ascii", "ignore").decode()
  result = re.sub(r"[^a-z0-9]+", "_", ascii_text.lower()).strip("_")
  return result or fallback


def unique(name: str, taken: set[str]) -> str:
  """`name`, or `name_2`, `name_3`... if already taken; records the result in `taken`."""
  candidate, n = name, 2
  while candidate in taken:
    candidate, n = f"{name}_{n}", n + 1
  taken.add(candidate)
  return candidate


def html_text(text: str) -> str:
  """Plain text -> HTML document; one <p> per non-empty line. Empty text -> empty document."""
  paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
  body = "".join(f"<p>{html.escape(p, quote=False)}</p>" for p in paragraphs)
  return f"<html><head></head><body>{body}</body></html>"


def options(names: list[str]) -> list[dict]:
  taken: set[str] = set()
  return [{"id": name, "name": name, "techName": unique(slug(name, "opcja"), taken)} for name in names]


def field(
  type_: str,
  tech_name: str,
  title: str,
  *,
  description: str = "",
  option_names: list[str] | None = None,
  validation: list[str] | None = None,
  read_only: bool = False,
  states: list[dict] | None = None,
  **extra: Any,
) -> dict:
  """A field object (`questionOrder` is set later by `place`). `extra` holds optional keys, e.g. dictionaryName."""
  node = {
    "id": str(uuid.uuid4()),
    "type": type_,
    "techName": tech_name,
    "title": title,
    "description": description,
    "options": options(option_names or []),
    "validation": list(validation or []),
    "readOnly": read_only,
    "repeatingSectionGrid": [],
    "states": list(states or []),
    "questionOrder": 0,
    "tooltipMessage": "",
  }
  node.update(extra)
  return node


def section(
  tech_name: str, title: str, fields: list[dict], *,
  repeating: bool = False, states: list[dict] | None = None, description: str = "",
) -> dict:
  node = field("REPEATING_SECTION" if repeating else "SECTION", tech_name, title, description=html_text(description), states=states)
  node["repeatingSectionGrid"] = place(fields, field_rows=lambda _: 1)
  return node


def section_rows(section_node: dict) -> int:
  """A section is one row taller than its fields (header), as in the reference outputs."""
  return len(section_node["repeatingSectionGrid"]) + 1


def place(nodes: list[dict], field_rows=section_rows) -> list[dict]:
  """Stack nodes vertically in a 3-column grid; `y` accumulates rows, `questionOrder` is the index."""
  items, y = [], 0
  for order, node in enumerate(nodes):
    node["questionOrder"] = order
    rows = field_rows(node)
    items.append({"x": 0, "y": y, "rows": rows, "cols": COLS, "field": node})
    y += rows
  return items


def page(title: str, sections: list[dict], type_: str = "MAIN") -> dict:
  return {"id": str(uuid.uuid4()), "title": title, "type": type_, "questions": place(sections)}


def flow(pages: list[dict]) -> dict:
  links = [
    {"id": str(uuid.uuid4()), "source": a["id"], "target": b["id"]}
    for a, b in zip(pages, pages[1:])
  ]
  return {"links": links}
