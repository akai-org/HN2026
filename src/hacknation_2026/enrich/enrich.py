"""Hints for a field from its label (dictionary, initial data, validators). Plain Python, no LLM.

The builder calls `enrich_field` for every subject-matter field and applies the result under the technical
rules (e.g. initial data => read-only). Data and the documents it comes from: catalog.py.
"""

import re
import unicodedata

from pydantic import BaseModel

from hacknation_2026.contracts import FieldSpec, FormSpec, ProposedDictionary
from hacknation_2026.enrich import catalog
from hacknation_2026.enrich.catalog import Rule
from hacknation_2026.rules.check import CHOICE_TYPES, FORMAT_VALIDATOR_TYPES, VALIDATORS

Span = tuple[int, int]  # word positions [start, end) of a phrase in the label


class Enrichment(BaseModel):
  dictionary_name: str | None = None
  multi_level_tree: bool = False
  search_enabled: bool = False
  default_value: str | None = None  # initial data, e.g. "MLPZ.email"
  external: bool = False            # -> defaultValueType "EXTERNAL_SYSTEM"
  read_only: bool = False           # Dane inicjalne: a field fed with initial data is read-only
  validators: list[str] = []        # from rules.check.VALIDATORS; REQUIRED when the field is required
  field_type: str | None = None     # the TEXT_FIELD should become this type (country -> SELECT, birth date -> DATEPICKER)


def normalize(text: str) -> str:
  """Lower case, Polish letters without diacritics, words split by single spaces ("Adres e-mail" -> "adres e mail")."""
  text = unicodedata.normalize("NFKD", text.lower().replace("ł", "l"))
  return " ".join(re.findall(r"[a-z0-9]+", "".join(ch for ch in text if not unicodedata.combining(ch))))


def enrich_field(label: str, field_type: str, required: bool, applicant_data: bool) -> Enrichment:
  """Initial data only for the applicant's own data (`applicant_data`), never for another person; a field fed with
  initial data gets no dictionary. Dictionaries only on a SELECT; a TEXT_FIELD asking for a country becomes one."""
  words = normalize(label).split()
  result = Enrichment(validators=_validators(words, field_type, required))
  initial = _initial_data(words, field_type) if applicant_data else None
  if initial:
    attribute, as_type = initial
    result.default_value, result.external, result.read_only = attribute.value, True, True
    result.field_type = as_type if as_type != field_type else None
    return result
  dictionary = _dictionary(words, field_type)
  if dictionary:
    result.dictionary_name = dictionary.value
    result.multi_level_tree = dictionary.multi_level_tree
    result.search_enabled = dictionary.search_enabled
    if field_type != catalog.DICTIONARY_FIELD_TYPE:
      result.field_type = catalog.DICTIONARY_FIELD_TYPE
  return result


# --- matching ---------------------------------------------------------------------------------------------------------

def _spans(words: list[str], phrase: str) -> list[Span]:
  target = phrase.split()
  size = len(target)
  return [(i, i + size) for i in range(len(words) - size + 1) if words[i:i + size] == target]


def _matches(words: list[str], rules) -> list[tuple[Rule, Span]]:
  """Every rule whose phrase occurs in the label (respecting `requires` and `forbids`), with the phrase's position."""
  present = set(words)
  found = []
  for rule in rules:
    if (rule.requires and not present.intersection(rule.requires)) or present.intersection(rule.forbids):
      continue
    found.extend((rule, span) for phrase in rule.phrases for span in _spans(words, phrase))
  return found


def _overlap(a: Span, b: Span) -> bool:
  return a[0] < b[1] and b[0] < a[1]


def _best(matches: list[tuple[Rule, Span]]) -> tuple[Rule, Span] | None:
  """The rule with the longest phrase ("Imię matki" beats "Imię"). None when a different rule matches elsewhere
  in the label, because the field then asks for two things ("Imię i nazwisko")."""
  if not matches:
    return None
  rule, span = max(matches, key=lambda match: match[1][1] - match[1][0])
  if any(other.value != rule.value and not _overlap(span, other_span) for other, other_span in matches):
    return None
  return rule, span


def _validators(words: list[str], field_type: str, required: bool) -> list[str]:
  found: set[str] = set()
  if field_type in FORMAT_VALIDATOR_TYPES and not set(words).intersection(catalog.ALTERNATIVE_WORDS):
    found = {rule.value for rule, _ in _matches(words, catalog.VALIDATOR_RULES)}
  wanted = (["REQUIRED"] if required else []) + (sorted(found) if len(found) == 1 else [])
  return [v for v in VALIDATORS if v in wanted]


def _initial_data(words: list[str], field_type: str) -> tuple[catalog.Attribute, str] | None:
  """The attribute the label asks for and the field type it needs (Dane inicjalne, "Typ pola"), or None."""
  registered = bool(set(words).intersection(catalog.REGISTERED_ADDRESS_WORDS))
  best = _best(_matches(words, catalog.REGISTERED_ADDRESS_RULES if registered else catalog.INITIAL_DATA_RULES))
  if best is None:
    return None
  rule, (start, end) = best
  rest = set(words[:start] + words[end:])
  if rest.intersection(catalog.OTHER_PERSON_WORDS) or rest.intersection(catalog.JOINING_WORDS):
    return None
  if registered:
    temporary = set(words).intersection(catalog.TEMPORARY_WORDS)
    attribute = catalog.ATTRIBUTES[(catalog.TEMPORARY_PREFIX if temporary else catalog.PERMANENT_PREFIX) + rule.value]
  else:
    attribute = catalog.ATTRIBUTES[rule.value]
  if field_type == attribute.field_type:
    return attribute, field_type
  if field_type == "TEXT_FIELD":  # e.g. a birth date the LLM typed as text
    return attribute, attribute.field_type
  return None


def _dictionary(words: list[str], field_type: str) -> catalog.Dictionary | None:
  matches = _matches(words, catalog.DICTIONARIES)
  if len({rule.value for rule, _ in matches}) != 1:
    return None
  dictionary = matches[0][0]
  if field_type == catalog.DICTIONARY_FIELD_TYPE:
    return dictionary
  label = " ".join(words)
  if field_type == "TEXT_FIELD" and any(label == p or label.startswith(p + " ") for p in dictionary.text_field_prefixes):
    return dictionary
  return None


# --- proposed new dictionaries (Słowniki: optional extension) ----------------------------------------------------------

MIN_VALUES = 6           # more options than a RADIO may have (Standardy): a list worth keeping as a dictionary
MIN_SHARED_VALUES = 3    # a shorter list is worth one when several fields repeat it
MAX_VALUE_LENGTH = 60    # dictionary entries are short names, not sentences
MAX_NAME_LENGTH = 50
TRIVIAL_VALUES = {"tak", "nie", "nie dotyczy", "nie wiem", "inne", "inny", "inna"}


def proposed_dictionaries(spec: FormSpec) -> list[ProposedDictionary]:
  """Słowniki: "zaproponuj jego nazwę, strukturę i zastosowanie". One proposal per distinct option list that
  is long, or that several fields share, and that no predefined dictionary covers."""
  groups: dict[tuple[str, ...], list[FieldSpec]] = {}
  for page in spec.pages:
    for section in page.sections:
      for field in section.fields:
        if _is_candidate(field):
          groups.setdefault(tuple(sorted({normalize(o) for o in field.options})), []).append(field)
  proposals: list[ProposedDictionary] = []
  taken: set[str] = set()
  for values, fields in groups.items():
    if len(values) >= MIN_VALUES or (len(fields) > 1 and len(values) >= MIN_SHARED_VALUES):
      proposals.append(ProposedDictionary(
        name=_unique_name(fields[0].label, taken),
        values_example=list(dict.fromkeys(fields[0].options)),
        used_by=[field.label for field in fields],
      ))
  return proposals


def _is_candidate(field: FieldSpec) -> bool:
  if field.type not in CHOICE_TYPES or not field.options or any(len(o) > MAX_VALUE_LENGTH for o in field.options):
    return False
  if {normalize(o) for o in field.options} <= TRIVIAL_VALUES:
    return False
  return not _matches(normalize(field.label).split(), catalog.DICTIONARIES)  # a predefined dictionary fits


def _unique_name(label: str, taken: set[str]) -> str:
  base = "_".join(normalize(label).upper().split())[:MAX_NAME_LENGTH].rstrip("_") or "SLOWNIK"
  name, number = base, 2
  while name in taken:
    name, number = f"{base}_{number}", number + 1
  taken.add(name)
  return name
