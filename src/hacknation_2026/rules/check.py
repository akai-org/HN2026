"""Block F: checks a FormDefinition against the form configuration rules. Plain Python, never raises.

Sources: `dane_zadania/materialy/` (Reguły techniczne, Opis importowanego pliku JSON + schema, Słowniki, Dane inicjalne)
plus clarifications from the domain experts (see docs/bloki/F-kontrola-regul.md):
- the FINISH page may hold INFO_SECTION and TEXT_BLOCK,
- initial data (EXTERNAL_SYSTEM) is read-only, except the attributes in `initial_data.EDITABLE_INITIAL_DATA`,
- page, field and flow link ids are UUIDs.
Validators per field type follow the component tables in Reguły techniczne (see `allowed_validators`).
"""

import re
from collections import deque
from typing import Any

from hacknation_2026 import initial_data
from hacknation_2026.contracts import FormDefinition, RuleViolation
from hacknation_2026.initial_data import EXTERNAL_SYSTEM

MAX_TITLE = 255
PAGE_TYPES = {"MAIN", "FINISH"}
SECTION_TYPES = {"SECTION", "REPEATING_SECTION"}
CHOICE_TYPES = {"SELECT", "RADIO", "CHECKBOX"}
# components that take user input: each must state whether it is required (`validation`)
INPUT_TYPES = CHOICE_TYPES | {"TEXT_FIELD", "NUMBER", "TEXTAREA", "FILE_UPLOADER", "DATEPICKER"}
FIELD_TYPES = INPUT_TYPES | {"CONSENT_SECTION", "TEXT_BLOCK", "INFO_SECTION"}
FINISH_FIELD_TYPES = {"INFO_SECTION", "TEXT_BLOCK"}
VALIDATORS = {"REQUIRED", "EMAIL", "PESEL", "NIP", "REGON", "ZIP_CODE", "EPUAP", "ADE", "SERIAL_NUMBER_ID_CARD"}
# Reguły techniczne, component tables: TEXT_FIELD may have any validator, the other inputs only REQUIRED,
# presentational components (TEXT_BLOCK, INFO_SECTION, CONSENT_SECTION) and sections none
FORMAT_VALIDATOR_TYPES = {"TEXT_FIELD"}
REQUIRED_ONLY_TYPES = INPUT_TYPES - FORMAT_VALIDATOR_TYPES
FIELD_STATES = {"SHOW", "READ_ONLY"}
SECTION_STATES = {"SHOW"}
# Słowniki: countries and address dictionaries (TERYT: voivodeship/district/commune/place) only on a dropdown
_ADDRESS_DICTIONARY = re.compile(r"kraj|teryt|wojew|powiat|gmin|miejscow", re.IGNORECASE)

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
# a reference to a field answer, in the two forms from Reguły techniczne; the compared value is optional
_REFERENCE = re.compile(
  r"""(?:"(?P<value>(?:[^"\\]|\\.)*)"\s+in\s+)?"""
  r"""tabs\[\s*'(?P<page>[^']*)'\s*in\s+title\s*\]\s*"""
  r"""\.questions\[\s*'(?P<section>[^']*)'\s*in\s+field\.techName\s*\]\s*\.field\."""
  r"""(?:repeatingSectionGrid\[\s*'(?P<field>[^']*)'\s*in\s+field\.techName\s*\]"""
  r"""|__userAnswer\[\s*\$repeatingSectionIndex\s*\]\[\s*'(?P<repeating_field>[^']*)'\s*in\s+fieldTechName\s*\])"""
)

# value types from the JSON schema / Reguły (defaultValue: string, or a list for SELECT/TEXTAREA/FILE_UPLOADER)
_VALUE_TYPES: dict[str, tuple[type, ...]] = {
  "id": (str,), "type": (str,), "techName": (str,), "title": (str,), "description": (str,),
  "options": (list,), "validation": (list,), "dictionaryName": (str,), "readOnly": (bool,),
  "repeatingSectionGrid": (list,), "defaultValue": (str, list), "defaultValueType": (str,),
  "consentSectionConfig": (dict,), "states": (list,), "tooltipMessage": (str,),
  "searchEnabled": (bool,), "multiLevelTree": (bool,), "selectAllEnabled": (bool,),
}
_GRID_KEYS = ("x", "y", "rows", "cols")


def check_form(form: FormDefinition) -> list[RuleViolation]:
  return _Checker(form).run()


def allowed_validators(kind: Any) -> set[str]:
  """Validators a field of this type may have (Reguły techniczne, component tables)."""
  if kind in FORMAT_VALIDATOR_TYPES:
    return set(VALIDATORS)
  if kind in REQUIRED_ONLY_TYPES:
    return {"REQUIRED"}
  return set()


def _is_number(value: Any) -> bool:
  return isinstance(value, (int, float)) and not isinstance(value, bool)


class _Checker:
  def __init__(self, form: Any):
    self.form = form
    self.violations: list[RuleViolation] = []
    self.ids: dict[str, str] = {}  # id -> path of first occurrence
    # (page title, section techName) -> (section node, {field techName: field node})
    self.index: dict[tuple[str, str], tuple[dict, dict[str, dict]]] = {}
    self.page_titles: set[str] = set()

  def add(self, code: str, message: str, path: str = "") -> None:
    self.violations.append(RuleViolation(code=code, message=message, path=path))

  # --- entry -----------------------------------------------------------------------------------------------------------

  def run(self) -> list[RuleViolation]:
    if not isinstance(self.form, dict):
      self.add("form.bad_value", "Definicja formularza musi być obiektem JSON.")
      return self.violations
    self.check_title()
    tabs = self.form.get("tabs")
    if not isinstance(tabs, list):
      self.add("form.missing_key", "Brak listy stron (tabs).", "tabs")
      return self.violations
    self.check_pages(tabs)
    pages = [(i, t) for i, t in enumerate(tabs) if isinstance(t, dict)]
    self.build_index(pages)
    for i, tab in pages:
      self.check_page(i, tab)
    self.check_states(pages)
    self.check_flow(tabs)
    return self.violations

  # --- form and pages --------------------------------------------------------------------------------------------------

  def check_title(self) -> None:
    title = self.form.get("title")
    if not isinstance(title, str) or not title.strip():
      self.add("title.empty", "Tytuł formularza jest pusty.", "title")
    elif len(title) > MAX_TITLE:
      self.add("title.too_long", f"Tytuł formularza ma {len(title)} znaków (max {MAX_TITLE}).", "title")

  def check_pages(self, tabs: list) -> None:
    if len(tabs) < 2:
      self.add("tabs.too_few", f"Formularz ma {len(tabs)} stron (minimum 2).", "tabs")
    finish = []
    for i, tab in enumerate(tabs):
      path = f"tabs[{i}]"
      if not isinstance(tab, dict):
        self.add("tab.bad_value", "Strona musi być obiektem.", path)
        continue
      self.check_id(tab.get("id"), path)
      if not isinstance(tab.get("title"), str):
        self.add("tab.missing_key", "Strona nie ma tytułu (title).", path)
      if tab.get("type") not in PAGE_TYPES:
        self.add("tab.type", f"Typ strony {tab.get('type')!r} spoza {sorted(PAGE_TYPES)}.", path)
      elif tab["type"] == "FINISH":
        finish.append(i)
    if len(finish) != 1:
      self.add("tabs.finish_count", f"Formularz ma {len(finish)} stron FINISH (wymagana dokładnie jedna).", "tabs")
    elif finish[0] != len(tabs) - 1:
      self.add("tabs.finish_not_last", "Strona FINISH nie jest ostatnią stroną.", f"tabs[{finish[0]}]")

  def build_index(self, pages: list[tuple[int, dict]]) -> None:
    for _, tab in pages:
      title = tab.get("title")
      if not isinstance(title, str):
        continue
      self.page_titles.add(title)
      for item in _list(tab.get("questions")):
        section = _dict(item.get("field")) if isinstance(item, dict) else {}
        name = section.get("techName")
        if not isinstance(name, str) or (title, name) in self.index:
          continue
        fields = {}
        for child in _list(section.get("repeatingSectionGrid")):
          node = _dict(child.get("field")) if isinstance(child, dict) else {}
          if isinstance(node.get("techName"), str):
            fields.setdefault(node["techName"], node)
        self.index[(title, name)] = (section, fields)

  def check_page(self, i: int, tab: dict) -> None:
    path = f"tabs[{i}]"
    questions = tab.get("questions")
    if not isinstance(questions, list):
      self.add("tab.missing_key", "Strona nie ma listy pól (questions).", path)
      return
    finish = tab.get("type") == "FINISH"
    field_count = 0
    section_names: set[str] = set()
    for j, item in enumerate(questions):
      node_path = f"{path}.questions[{j}].field"
      node = self.check_item(item, f"{path}.questions[{j}]")
      if node is None:
        continue
      self.check_node(node, node_path)
      self.check_tech_name(node, node_path, section_names, "sekcji na stronie")
      if node.get("type") not in SECTION_TYPES:
        self.add("nesting.top_level_field", "Pole musi być zagnieżdżone w sekcji lub sekcji powtarzającej się.", node_path)
        continue
      field_count += self.check_section(node, node_path, finish)
    if field_count == 0:
      self.add("tab.empty", "Strona nie zawiera żadnego pola.", path)

  def check_section(self, section: dict, path: str, finish: bool) -> int:
    children = section.get("repeatingSectionGrid")
    if not isinstance(children, list):
      return 0
    names: set[str] = set()
    count = 0
    for k, item in enumerate(children):
      node_path = f"{path}.repeatingSectionGrid[{k}].field"
      node = self.check_item(item, f"{path}.repeatingSectionGrid[{k}]")
      if node is None:
        continue
      count += 1
      self.check_node(node, node_path)
      self.check_tech_name(node, node_path, names, "pól w sekcji")
      kind = node.get("type")
      if kind in SECTION_TYPES:
        self.add("nesting.section_in_section", "Sekcja nie może być zagnieżdżona w innej sekcji.", node_path)
      elif finish and kind not in FINISH_FIELD_TYPES:
        self.add(
          "finish.input_field",
          f"Na stronie FINISH dozwolone są tylko {sorted(FINISH_FIELD_TYPES)}, a jest {kind!r}.", node_path,
        )
    return count

  def check_item(self, item: Any, path: str) -> dict | None:
    """A grid item {x, y, rows, cols, field}; returns the field node or None."""
    if not isinstance(item, dict):
      self.add("field.bad_value", "Element siatki musi być obiektem.", path)
      return None
    for key in _GRID_KEYS:
      if key not in item:
        self.add("field.missing_key", f"Brak klucza {key!r} w pozycji elementu.", path)
      elif not _is_number(item[key]) or item[key] < 0:
        self.add("field.bad_value", f"{key!r} musi być nieujemną liczbą.", path)
    node = item.get("field")
    if not isinstance(node, dict):
      self.add("field.missing_key", "Brak obiektu 'field'.", path)
      return None
    return node

  # --- single node -----------------------------------------------------------------------------------------------------

  def check_node(self, node: dict, path: str) -> None:
    kind = node.get("type")
    required = ["id", "type", "techName"]
    if kind in SECTION_TYPES:
      required.append("title")
    if kind in INPUT_TYPES:
      required.append("validation")
    if kind in CHOICE_TYPES:
      required.append("options")
    if kind == "CONSENT_SECTION":
      required.append("consentSectionConfig")
    if kind == "INFO_SECTION":
      required.append("description")
    for key in required:
      if key not in node:
        self.add("field.missing_key", f"Brak wymaganego klucza {key!r}.", path)
    for key, types in _VALUE_TYPES.items():
      if key in node and not isinstance(node[key], types):
        self.add("field.bad_value", f"Klucz {key!r} ma niepoprawny typ wartości.", path)
    if "questionOrder" in node and not _is_number(node["questionOrder"]):
      self.add("field.bad_value", "Klucz 'questionOrder' musi być liczbą.", path)
    if "type" in node and kind not in FIELD_TYPES | SECTION_TYPES:
      self.add("field.type", f"Nieznany typ pola {kind!r}.", path)
    if "id" in node:
      self.check_id(node["id"], path)
    self.check_validation(node, path)
    self.check_options(node, path)
    if kind == "CONSENT_SECTION" and "consentSectionConfig" in node:
      self.check_consents(node["consentSectionConfig"], path)
    self.check_initial_data(node, path)

  def check_id(self, value: Any, path: str) -> None:
    if not isinstance(value, str) or not _UUID.match(value):
      self.add("id.not_uuid", f"Identyfikator {value!r} nie jest UUID.", path)
      return
    key = value.lower()
    if key in self.ids:
      self.add("id.duplicate", f"Identyfikator {value} powtarza się (pierwszy raz: {self.ids[key]}).", path)
    else:
      self.ids[key] = path

  def check_tech_name(self, node: dict, path: str, taken: set[str], scope: str) -> None:
    name = node.get("techName")
    if not isinstance(name, str) or not name.strip():
      self.add("techName.empty", "Pusta nazwa techniczna (techName).", path)
    elif name in taken:
      self.add("techName.duplicate", f"techName {name!r} powtarza się w obrębie {scope}.", path)
    else:
      taken.add(name)

  def check_validation(self, node: dict, path: str) -> None:
    kind = node.get("type")
    allowed = allowed_validators(kind)
    for value in _list(node.get("validation")):
      if value not in VALIDATORS:
        self.add("validation.unknown", f"Walidator {value!r} spoza listy dozwolonych.", path)
      elif kind in FIELD_TYPES | SECTION_TYPES and value not in allowed:
        hint = f"dozwolone: {sorted(allowed)}" if allowed else "pole tego typu nie ma walidatorów"
        self.add("validation.not_allowed_for_type", f"Walidator {value!r} niedozwolony w polu typu {kind!r} ({hint}).", path)

  def check_options(self, node: dict, path: str) -> None:
    kind = node.get("type")
    options = _list(node.get("options"))
    dictionary = node.get("dictionaryName")
    for m, option in enumerate(options):
      if not isinstance(option, dict) or any(not isinstance(option.get(k), str) for k in ("id", "name", "techName")):
        self.add("option.missing_key", "Opcja musi mieć 'id', 'name' i 'techName'.", f"{path}.options[{m}]")
    if options and kind not in CHOICE_TYPES:
      self.add("options.on_non_choice", f"Pole typu {kind!r} nie może mieć opcji wyboru.", path)
    if dictionary:
      if kind not in CHOICE_TYPES:
        self.add("dictionary.wrong_type", f"Słownik w polu typu {kind!r} (dozwolone {sorted(CHOICE_TYPES)}).", path)
      elif kind != "SELECT" and isinstance(dictionary, str) and _ADDRESS_DICTIONARY.search(dictionary):
        self.add("dictionary.wrong_type", f"Słownik {dictionary!r} można przypisać tylko do listy rozwijanej.", path)
      if options:
        self.add("dictionary.options_not_empty", "Pole korzystające ze słownika musi mieć pustą tablicę opcji.", path)
    elif kind in CHOICE_TYPES and "options" in node and not options:
      self.add("choice.no_options", "Pole wyboru nie ma ani opcji, ani słownika.", path)

  def check_consents(self, config: Any, path: str) -> None:
    config_path = f"{path}.consentSectionConfig"
    if not isinstance(config, dict):
      return  # reported as field.bad_value
    consents = config.get("consents")
    if not isinstance(consents, list) or not consents:
      self.add("consent.config", "Sekcja zgód musi mieć niepustą listę 'consents'.", config_path)
    else:
      for n, consent in enumerate(consents):
        if (
          not isinstance(consent, dict)
          or not isinstance(consent.get("description"), str)
          or not isinstance(consent.get("required"), bool)
        ):
          self.add("consent.config", "Zgoda musi mieć 'description' (tekst) i 'required' (true/false).",
                   f"{config_path}.consents[{n}]")
    if "files" in config and not isinstance(config["files"], list):
      self.add("consent.config", "'files' musi być listą.", config_path)
    if "required" in config and not isinstance(config["required"], bool):
      self.add("consent.config", "'required' musi być wartością true/false.", config_path)

  def check_initial_data(self, node: dict, path: str) -> None:
    value_type = node.get("defaultValueType")
    if value_type in (None, ""):
      return
    if value_type != EXTERNAL_SYSTEM:
      self.add("initial.bad_type", f"defaultValueType {value_type!r} (dozwolone {EXTERNAL_SYSTEM!r} lub puste).", path)
      return
    value = node.get("defaultValue")
    if not isinstance(value, str) or not value.strip():
      self.add("initial.no_value", "Pole z danymi inicjalnymi nie wskazuje źródła i atrybutu (defaultValue).", path)
      return
    if not initial_data.is_known(value):
      self.add("initial.unknown_source", f"Nieznane źródło lub atrybut danych inicjalnych {value!r}.", path)
    if node.get("readOnly") is not True and not initial_data.is_editable(value):
      self.add("initial.not_read_only", f"Pole zasilane danymi inicjalnymi ({value}) musi być tylko do odczytu.", path)

  # --- states (JSONata) ------------------------------------------------------------------------------------------------

  def check_states(self, pages: list[tuple[int, dict]]) -> None:
    for i, tab in pages:
      for j, item in enumerate(_list(tab.get("questions"))):
        section = _dict(item.get("field")) if isinstance(item, dict) else {}
        section_path = f"tabs[{i}].questions[{j}].field"
        allowed = SECTION_STATES if section.get("type") in SECTION_TYPES else FIELD_STATES
        self.check_node_states(section, section_path, allowed)
        for k, child in enumerate(_list(section.get("repeatingSectionGrid"))):
          node = _dict(child.get("field")) if isinstance(child, dict) else {}
          self.check_node_states(node, f"{section_path}.repeatingSectionGrid[{k}].field", FIELD_STATES)

  def check_node_states(self, node: dict, path: str, allowed: set[str]) -> None:
    for s, state in enumerate(_list(node.get("states"))):
      state_path = f"{path}.states[{s}]"
      if not isinstance(state, dict):
        self.add("state.type", "Stan musi być obiektem {type, query}.", state_path)
        continue
      if state.get("type") not in allowed:
        self.add("state.type", f"Stan {state.get('type')!r} spoza {sorted(allowed)}.", state_path)
      query = state.get("query")
      if not isinstance(query, str) or not query.strip():
        self.add("state.empty_query", "Stan nie ma warunku (query).", state_path)
        continue
      references = list(_REFERENCE.finditer(query))
      if not references:
        self.add("state.no_reference", "Warunek nie odwołuje się do żadnego pola formularza.", state_path)
      for match in references:
        self.check_reference(match, state_path)

  def check_reference(self, match: re.Match, path: str) -> None:
    page, section_name = match["page"], match["section"]
    repeating = match["repeating_field"] is not None
    field_name = match["repeating_field"] if repeating else match["field"]
    if page not in self.page_titles:
      self.add("state.unknown_page", f"Warunek wskazuje nieistniejącą stronę {page!r}.", path)
      return
    if (page, section_name) not in self.index:
      self.add("state.unknown_section", f"Warunek wskazuje nieistniejącą sekcję {section_name!r} na stronie {page!r}.", path)
      return
    section, fields = self.index[(page, section_name)]
    if repeating != (section.get("type") == "REPEATING_SECTION"):
      self.add(
        "state.repeating_mismatch",
        f"Składnia odwołania nie pasuje do typu sekcji {section_name!r} ({section.get('type')}).", path,
      )
    target = fields.get(field_name)
    if target is None:
      self.add("state.unknown_field", f"Warunek wskazuje nieistniejące pole {field_name!r} w sekcji {section_name!r}.", path)
      return
    value = match["value"]
    names = [o.get("name") for o in _list(target.get("options")) if isinstance(o, dict)]
    if value is not None and names and not target.get("dictionaryName"):
      value = re.sub(r"\\(.)", r"\1", value)
      if value not in names:
        self.add("state.unknown_option", f"Pole {field_name!r} nie ma opcji {value!r}.", path)

  # --- flow ------------------------------------------------------------------------------------------------------------

  def check_flow(self, tabs: list) -> None:
    flow = self.form.get("flow")
    links = flow.get("links") if isinstance(flow, dict) else None
    if not isinstance(links, list):
      self.add("flow.missing", "Brak warunków przepływu stron (flow.links).", "flow")
      return
    page_ids = [t.get("id") for t in tabs if isinstance(t, dict)]
    known = {p for p in page_ids if isinstance(p, str)}
    edges: dict[str, set[str]] = {p: set() for p in known}
    for n, link in enumerate(links):
      path = f"flow.links[{n}]"
      if not isinstance(link, dict):
        self.add("flow.unknown_page", "Przejście musi być obiektem {id, source, target}.", path)
        continue
      self.check_id(link.get("id"), path)
      source, target = link.get("source"), link.get("target")
      if source not in known or target not in known:
        self.add("flow.unknown_page", "Przejście wskazuje nieistniejącą stronę (source/target).", path)
        continue
      edges[source].add(target)
    if not page_ids or not isinstance(page_ids[0], str):
      return
    reached, queue = {page_ids[0]}, deque([page_ids[0]])
    while queue:
      for nxt in edges.get(queue.popleft(), ()):
        if nxt not in reached:
          reached.add(nxt)
          queue.append(nxt)
    for i, tab in enumerate(tabs):
      if not isinstance(tab, dict) or not isinstance(tab.get("id"), str):
        continue
      if tab["id"] not in reached:
        self.add("flow.unreachable", "Strona nie jest osiągalna z pierwszej strony.", f"tabs[{i}]")
      if tab.get("type") == "MAIN" and not edges.get(tab["id"]):
        self.add("flow.dead_end", "Ze strony MAIN nie prowadzi żadne przejście.", f"tabs[{i}]")


def _list(value: Any) -> list:
  return value if isinstance(value, list) else []


def _dict(value: Any) -> dict:
  return value if isinstance(value, dict) else {}
