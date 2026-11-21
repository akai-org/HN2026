"""Block D: FormSpec (LLM output) -> FormDefinition. Plain Python, no AI.

The output follows the specification in `dane_zadania/materialy/` (Reguły techniczne, Opis importowanego pliku JSON,
Standardy, Słowniki, Dane inicjalne). Rules that hold for every field are enforced here, in FieldFactory.
"""

from dataclasses import dataclass, field as dc_field

from hacknation_2026 import initial_data
from hacknation_2026.builder import jsonata, layout, standard_sections as std
from hacknation_2026.config import Settings
from hacknation_2026.contracts import Condition, FieldSpec, FormDefinition, FormSpec, PageSpec
from hacknation_2026.initial_data import EXTERNAL_SYSTEM

from hacknation_2026.enrich.enrich import enrich_field

MAX_TITLE_LENGTH = 255  # Reguły techniczne: title max 255 characters
# Reguły techniczne: the list of validators
VALIDATORS = ("REQUIRED", "EMAIL", "PESEL", "NIP", "REGON", "ZIP_CODE", "EPUAP", "ADE", "SERIAL_NUMBER_ID_CARD")
# presentational types: no required attribute, no input
NO_VALIDATION = {"TEXT_BLOCK", "INFO_SECTION", "CONSENT_SECTION"}
MAX_RADIO_OPTIONS = 5     # Standardy: dropdown when there are more than 5 options
SEARCH_FROM_OPTIONS = 16  # Standardy: search when there are more than 15 options


@dataclass
class _NoEnrichment:
  dictionary_name: str | None = None
  multi_level_tree: bool = False
  search_enabled: bool = False
  default_value: str | None = None
  external: bool = False
  read_only: bool = False
  validators: list[str] = dc_field(default_factory=list)
  field_type: str | None = None


class FieldFactory:
  """Builds a field node. Explicit arguments win over block E's enrichment; the technical rules win over both:

  - initial data (`defaultValueType: EXTERNAL_SYSTEM`) => read-only (Dane inicjalne), except the register attributes
    in `initial_data.EDITABLE_INITIAL_DATA` (domain experts: may be outdated), which are editable,
  - a dictionary only on SELECT/RADIO/CHECKBOX, and then `options` is empty (Reguły techniczne, Słowniki),
  - block E may turn a TEXT_FIELD into a more specific type (country -> SELECT with Kraje, birth date -> DATEPICKER),
  - block E's dictionary only for a field without options of its own: the paper form's options are kept,
  - validators only from the allowed list, REQUIRED for required fields, none for presentational types,
  - RADIO with more than 5 options becomes SELECT; SELECT with more than 15 options gets search (Standardy).
  """

  def __init__(self, settings: Settings):
    self.settings = settings

  def __call__(
    self,
    type_: str,
    tech_name: str,
    title: str,
    *,
    required: bool = False,
    applicant_data: bool = False,
    validators: list[str] | None = None,
    initial: str | None = None,
    enrich: bool = True,
    read_only: bool | None = None,
    description: str = "",
    option_names: list[str] | None = None,
    states: list[dict] | None = None,
    **extra,
  ) -> dict:
    option_names = list(option_names or [])
    if type_ == "RADIO" and len(option_names) > MAX_RADIO_OPTIONS:
      type_ = "SELECT"
    enrichment = self._enrich(title, type_, required, applicant_data) if enrich else _NoEnrichment()
    if enrichment.field_type and type_ == "TEXT_FIELD":
      type_ = enrichment.field_type

    optional: dict = {}
    if enrichment.default_value is not None:
      optional["defaultValue"] = enrichment.default_value
      if enrichment.external:
        optional["defaultValueType"] = EXTERNAL_SYSTEM
    if initial:
      optional.update(defaultValue=initial, defaultValueType=EXTERNAL_SYSTEM)
    if enrichment.dictionary_name and not option_names:
      optional.update(
        dictionaryName=enrichment.dictionary_name,
        multiLevelTree=enrichment.multi_level_tree,
        searchEnabled=enrichment.search_enabled,
      )
    optional.update(extra)

    if type_ not in layout.CHOICE_TYPES:
      option_names = []
      for key in ("dictionaryName", "multiLevelTree", "searchEnabled"):
        optional.pop(key, None)
    if optional.get("dictionaryName"):
      option_names = []
    if type_ == "SELECT" and len(option_names) >= SEARCH_FROM_OPTIONS:
      optional["searchEnabled"] = True

    is_read_only = enrichment.read_only if read_only is None else read_only
    if optional.get("defaultValueType") == EXTERNAL_SYSTEM:
      # read-only, unless the register attribute may be outdated (then editable unless asked otherwise)
      editable = initial_data.is_editable(str(optional.get("defaultValue", "")))
      is_read_only = bool(read_only) if editable else True

    return layout.field(
      type_, tech_name, title,
      description=description,
      option_names=option_names,
      validation=self._validation(type_, required, [*enrichment.validators, *(validators or [])]),
      read_only=is_read_only,
      states=states,
      **optional,
    )

  def _validation(self, type_: str, required: bool, validators: list[str]) -> list[str]:
    if type_ in NO_VALIDATION or not self.settings.emit_validators:
      return []
    wanted = (["REQUIRED"] if required else []) + validators
    return [v for v in VALIDATORS if v in wanted]

  def _enrich(self, label: str, type_: str, required: bool, applicant_data: bool):
    if type_ in NO_VALIDATION:
      return _NoEnrichment()
    return enrich_field(label, type_, required, applicant_data)


# --- subject-matter pages from FormSpec -------------------------------------------------------------------------------

@dataclass(frozen=True)
class Address:
  page: str
  section: str
  field: str
  repeating: bool = False

  def answer(self) -> str:
    path = jsonata.repeating_answer_path if self.repeating else jsonata.answer_path
    return path(self.page, self.section, self.field)


def non_empty_pages(pages: list[PageSpec]) -> list[PageSpec]:
  """Reguły techniczne: every page has at least one field, so empty sections and pages are dropped."""
  result = []
  for page in pages:
    sections = [s for s in page.sections if s.fields]
    if sections:
      result.append(page.model_copy(update={"sections": sections}))
  return result


def _tech_names(pages: list[PageSpec]) -> tuple[list[list[str]], list[list[list[str]]], dict[str, Address]]:
  """techNames for sections (unique per page) and fields (unique per section), plus FieldSpec.key -> Address."""
  section_names, field_names, addresses = [], [], {}
  for page in pages:
    taken_sections: set[str] = set()
    page_sections, page_fields = [], []
    for section in page.sections:
      section_name = layout.unique(layout.slug(section.key or section.title, "sekcja"), taken_sections)
      taken_fields: set[str] = set()
      names = []
      for spec_field in section.fields:
        name = layout.unique(layout.slug(spec_field.key or spec_field.label), taken_fields)
        names.append(name)
        addresses.setdefault(spec_field.key, Address(page.title, section_name, name, section.repeating))
      page_sections.append(section_name)
      page_fields.append(names)
    section_names.append(page_sections)
    field_names.append(page_fields)
  return section_names, field_names, addresses


def condition_states(conditions: list[Condition], addresses: dict[str, Address]) -> list[dict]:
  """AND of `show_if` conditions as a SHOW state; conditions pointing at unknown fields are dropped (block F reports them)."""
  parts = [jsonata.equals(c.equals, addresses[c.field].answer()) for c in conditions if c.field in addresses]
  return jsonata.show(jsonata.and_(*parts))


def _spec_field(make: FieldFactory, spec_field: FieldSpec, tech_name: str, addresses: dict[str, Address]) -> dict:
  states = condition_states(spec_field.show_if, addresses)
  if spec_field.type == "TEXT_BLOCK":
    text = spec_field.description or spec_field.label
    return make("TEXT_BLOCK", tech_name, "", description=layout.html_text(text), states=states)
  return make(
    spec_field.type, tech_name, spec_field.label,
    required=spec_field.required,
    applicant_data=spec_field.applicant_data,
    description=layout.html_text(spec_field.description) if spec_field.description.strip() else "",
    option_names=spec_field.options,
    states=states,
  )


def subject_pages(spec: FormSpec, make: FieldFactory) -> list[dict]:
  spec_pages = non_empty_pages(spec.pages)
  section_names, field_names, addresses = _tech_names(spec_pages)
  pages = []
  for page, sec_names, fld_names in zip(spec_pages, section_names, field_names):
    sections = [
      layout.section(
        sec_name, section.title,
        [_spec_field(make, f, name, addresses) for f, name in zip(section.fields, names)],
        repeating=section.repeating,
        states=condition_states(section.show_if, addresses),
      )
      for section, sec_name, names in zip(page.sections, sec_names, fld_names)
    ]
    pages.append(layout.page(page.title, sections))
  return pages


# --- whole form -------------------------------------------------------------------------------------------------------

def build_form(spec: FormSpec, settings: Settings) -> FormDefinition:
  """Data page -> subject-matter pages -> contact & consents -> finish page, linked linearly (Standardy, order of data)."""
  make = FieldFactory(settings)
  tabs = [
    layout.page(std.DATA_PAGE, std.data_page_sections(spec, make)),
    *subject_pages(spec, make),
    layout.page(std.CONTACT_PAGE, std.contact_sections(spec, make)),
    layout.page(std.FINISH_PAGE, std.finish_sections(spec, make), type_="FINISH"),
  ]
  return {"title": spec.title.strip()[:MAX_TITLE_LENGTH], "tabs": tabs, "flow": layout.flow(tabs)}
