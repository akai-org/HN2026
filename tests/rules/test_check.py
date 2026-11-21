"""Block F: check_form against the specification, the reference outputs and deliberately broken copies of them."""

import copy
import json
import re
import uuid
from pathlib import Path

import pytest

from hacknation_2026.builder import build
from hacknation_2026.config import Settings
from hacknation_2026.contracts import Condition, FieldSpec, FormSpec, PageSpec, SectionSpec
from hacknation_2026.rules import check_form

ROOT = Path(__file__).resolve().parents[2]


def load_reference(number: str) -> dict:
  [path] = ROOT.glob(f"dane_zadania/blankiety/{number}.*/konfiguracja_form_*.json")
  return json.loads(path.read_text(encoding="utf-8"))


def violations(form) -> set[tuple[str, str]]:
  return {(v.code, v.path) for v in check_form(form)}


def grid(i: int, j: int, k: int | None = None) -> str:
  path = f"tabs[{i}].questions[{j}].field"
  return path if k is None else f"{path}.repeatingSectionGrid[{k}].field"


_MLPZ_ADDRESS = [(grid(0, 3, k)) for k in (0, 1, 3, 8)]  # kod_pocztowy, ulica, numer_budynku, numer_lokalu

# Errors in the reference outputs; the specification wins (CLAUDE.md). Anything else found there is a false positive.
KNOWN_REFERENCE_VIOLATIONS = {
  "1": {
    # Dane inicjalne: initial data is read-only; experts allow exceptions only for MLPZ.phoneNumber / MLPZ.email
    *(("initial.not_read_only", p) for p in _MLPZ_ADDRESS),
    # Opis importowanego pliku JSON: `validation` is an array of strings, the reference has `{}`
    ("field.bad_value", grid(0, 4, 3)),
    ("field.bad_value", grid(0, 5, 2)),
    ("field.bad_value", grid(0, 7, 0)),
  },
  "5": {
    *(("initial.not_read_only", p) for p in _MLPZ_ADDRESS),
    # Reguły techniczne: each option has id, name and techName; "Reprezentant" has no techName
    ("option.missing_key", f"{grid(0, 1, 0)}.options[1]"),
    # Opis importowanego pliku JSON: flow link id is a UUID; the reference has "a16ec", "aa405", "a0icc"
    *(("id.not_uuid", f"flow.links[{n}]") for n in range(3)),
  },
}


@pytest.fixture(scope="module")
def reference5() -> dict:
  return load_reference("5")


@pytest.mark.parametrize("number", ["1", "5"])
def test_reference_has_only_known_violations(number):
  assert violations(load_reference(number)) == KNOWN_REFERENCE_VIOLATIONS[number]


# --- builder output ---------------------------------------------------------------------------------------------------

def _spec() -> FormSpec:
  return FormSpec(
    title="Wniosek o testowe pozwolenie",
    authority_name="Urząd Gminy Testowo",
    allows_other_person=True,
    allows_legal_entity=True,
    allows_proxy=True,
    pages=[
      PageSpec(title="Szczegóły", sections=[
        SectionSpec(key="sposob", title="Sposób", fields=[
          FieldSpec(key="sposob_odbioru", label="Sposób odbioru", type="RADIO", required=True,
                    options=["Osobiście", "Pocztą", "Inaczej"]),
          FieldSpec(key="adres_odbioru", label="Adres odbioru", type="TEXT_FIELD", required=True,
                    show_if=[Condition(field="sposob_odbioru", equals="Pocztą")]),
          FieldSpec(key="wojewodztwo_wybor", label="Województwo", type="SELECT", required=False,
                    options=[f"Opcja {n}" for n in range(20)]),
          FieldSpec(key="info", label="Informacja", type="TEXT_BLOCK", required=False, description="Tekst."),
        ]),
        SectionSpec(key="dzialki", title="Działki", repeating=True, fields=[
          FieldSpec(key="rodzaj", label="Rodzaj", type="RADIO", required=True, options=["Rolna", "Budowlana"]),
          FieldSpec(key="numer", label="Numer działki", type="TEXT_FIELD", required=True,
                    show_if=[Condition(field="rodzaj", equals="Budowlana")]),
          FieldSpec(key="data", label="Data nabycia", type="DATEPICKER", required=False),
          FieldSpec(key="powierzchnia", label="Powierzchnia", type="NUMBER", required=False),
        ]),
        SectionSpec(key="zalaczniki", title="Załączniki", show_if=[Condition(field="sposob_odbioru", equals="Inaczej")],
                    fields=[FieldSpec(key="plik", label="Plik", type="FILE_UPLOADER", required=False)]),
      ]),
    ],
    consents=["Oświadczam, że dane są prawdziwe.", "Wyrażam zgodę na kontakt."],
  )


def test_builder_output_has_no_violations():
  """Blocks D + E (real enrichment, no LLM) produce a form that passes every rule."""
  settings = Settings(_env_file=None, llm_api_key="k", llm_model="m")
  form = build.build_form(_spec(), settings)
  assert check_form(form) == []


# --- deliberately broken copies of reference 5 ------------------------------------------------------------------------

def node(form: dict, i: int, j: int, k: int | None = None) -> dict:
  section = form["tabs"][i]["questions"][j]["field"]
  return section if k is None else section["repeatingSectionGrid"][k]["field"]


def fresh(item: dict) -> dict:
  """Deep copy with new ids for every node, so a copied element does not duplicate ids."""
  item = copy.deepcopy(item)
  stack = [item]
  while stack:
    current = stack.pop()
    if isinstance(current, dict):
      if "type" in current and "id" in current:
        current["id"] = str(uuid.uuid4())
      stack.extend(current.values())
    elif isinstance(current, list):
      stack.extend(current)
  return item


def set_query(form: dict, pattern: str, replacement: str) -> None:
  """Rewrite the query of nazwa_podatku (shown for one option of wybierz_co_mamy_zrobic_z_nadplata)."""
  state = node(form, 1, 1, 1)["states"][0]
  state["query"] = re.sub(pattern, replacement, state["query"])


def swap_finish(f):
  f["tabs"][2]["type"], f["tabs"][3]["type"] = "FINISH", "MAIN"


def remove_middle_link(f):
  del f["flow"]["links"][1]


NAZWA_PODATKU = grid(1, 1, 1)
KWOTA = grid(1, 0, 1)
PODATEK = grid(1, 0, 0)
RADIO = grid(1, 1, 0)
KRAJ = grid(0, 3, 6)
IMIE = grid(0, 2, 1)

BROKEN = [
  ("title.empty", "title", lambda f: f.update(title="  ")),
  ("title.too_long", "title", lambda f: f.update(title="x" * 256)),
  ("tabs.too_few", "tabs", lambda f: f.update(tabs=f["tabs"][-1:])),
  ("tab.type", "tabs[1]", lambda f: f["tabs"][1].update(type="PAGE")),
  ("tabs.finish_count", "tabs", lambda f: f["tabs"][1].update(type="FINISH")),
  ("tabs.finish_not_last", "tabs[2]", swap_finish),
  ("tab.empty", "tabs[1]", lambda f: f["tabs"][1].update(questions=[])),
  ("nesting.top_level_field", "tabs[1].questions[3].field",
   lambda f: f["tabs"][1]["questions"].append(fresh(f["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"][0]))),
  ("nesting.section_in_section", grid(1, 0, 3),
   lambda f: node(f, 1, 0)["repeatingSectionGrid"].append(fresh(f["tabs"][1]["questions"][2]))),
  ("finish.input_field", grid(3, 0, 0), lambda f: node(f, 3, 0, 0).update(type="TEXT_FIELD")),
  ("field.missing_key", PODATEK, lambda f: node(f, 1, 0, 0).pop("techName")),
  ("field.missing_key", KWOTA, lambda f: node(f, 1, 0, 1).pop("validation")),
  ("field.missing_key", RADIO, lambda f: node(f, 1, 1, 0).pop("options")),
  ("field.missing_key", grid(1, 0), lambda f: node(f, 1, 0).pop("title")),
  ("field.missing_key", grid(2, 1, 0), lambda f: node(f, 2, 1, 0).pop("consentSectionConfig")),
  ("field.missing_key", "tabs[1].questions[0]", lambda f: f["tabs"][1]["questions"][0].pop("x")),
  ("field.type", PODATEK, lambda f: node(f, 1, 0, 0).update(type="FOO")),
  ("field.bad_value", PODATEK, lambda f: node(f, 1, 0, 0).update(readOnly="nie")),
  ("field.bad_value", PODATEK, lambda f: node(f, 1, 0, 0).update(validation={})),
  ("field.bad_value", "tabs[1].questions[0]", lambda f: f["tabs"][1]["questions"][0].update(y=-1)),
  ("id.not_uuid", PODATEK, lambda f: node(f, 1, 0, 0).update(id="abc")),
  ("id.not_uuid", "tabs[1]", lambda f: f["tabs"][1].update(id="strona-2")),
  ("id.duplicate", KWOTA, lambda f: node(f, 1, 0, 1).update(id=node(f, 1, 0, 0)["id"])),
  ("techName.empty", PODATEK, lambda f: node(f, 1, 0, 0).update(techName="")),
  ("techName.duplicate", KWOTA, lambda f: node(f, 1, 0, 1).update(techName=node(f, 1, 0, 0)["techName"])),
  ("techName.duplicate", grid(1, 1), lambda f: node(f, 1, 1).update(techName=node(f, 1, 0)["techName"])),
  ("validation.unknown", PODATEK, lambda f: node(f, 1, 0, 0).update(validation=["REQUIRED", "FOO"])),
  ("option.missing_key", f"{RADIO}.options[0]", lambda f: node(f, 1, 1, 0)["options"][0].pop("techName")),
  ("options.on_non_choice", PODATEK,
   lambda f: node(f, 1, 0, 0).update(options=[{"id": "a", "name": "A", "techName": "a"}])),
  ("dictionary.wrong_type", PODATEK, lambda f: node(f, 1, 0, 0).update(dictionaryName="Kraje")),
  ("dictionary.wrong_type", KRAJ, lambda f: node(f, 0, 3, 6).update(type="RADIO")),
  ("dictionary.options_not_empty", KRAJ,
   lambda f: node(f, 0, 3, 6).update(options=[{"id": "Polska", "name": "Polska", "techName": "polska"}])),
  ("choice.no_options", RADIO, lambda f: node(f, 1, 1, 0).update(options=[])),
  ("consent.config", f"{grid(2, 1, 0)}.consentSectionConfig",
   lambda f: node(f, 2, 1, 0)["consentSectionConfig"].update(consents=[])),
  ("consent.config", f"{grid(2, 1, 0)}.consentSectionConfig.consents[0]",
   lambda f: node(f, 2, 1, 0)["consentSectionConfig"]["consents"][0].update(required="tak")),
  ("initial.not_read_only", IMIE, lambda f: node(f, 0, 2, 1).update(readOnly=False)),
  ("initial.unknown_source", IMIE, lambda f: node(f, 0, 2, 1).update(defaultValue="PESEL.nick")),
  ("initial.unknown_source", IMIE, lambda f: node(f, 0, 2, 1).update(defaultValue="CEIDG.name")),
  ("initial.bad_type", IMIE, lambda f: node(f, 0, 2, 1).update(defaultValueType="REGISTRY")),
  ("initial.no_value", IMIE, lambda f: node(f, 0, 2, 1).update(defaultValue="")),
  ("state.type", f"{NAZWA_PODATKU}.states[0]", lambda f: node(f, 1, 1, 1)["states"][0].update(type="HIDE")),
  ("state.type", f"{grid(0, 4)}.states[0]", lambda f: node(f, 0, 4)["states"][0].update(type="READ_ONLY")),
  ("state.empty_query", f"{NAZWA_PODATKU}.states[0]", lambda f: node(f, 1, 1, 1)["states"][0].update(query=" ")),
  ("state.no_reference", f"{NAZWA_PODATKU}.states[0]", lambda f: node(f, 1, 1, 1)["states"][0].update(query="true")),
  ("state.unknown_page", f"{NAZWA_PODATKU}.states[0]", lambda f: set_query(f, r"tabs\['[^']*'", "tabs['Brak strony'")),
  ("state.unknown_section", f"{NAZWA_PODATKU}.states[0]",
   lambda f: set_query(f, r"'rozliczenie_nadplaty'", "'brak_sekcji'")),
  ("state.unknown_field", f"{NAZWA_PODATKU}.states[0]",
   lambda f: set_query(f, r"'wybierz_co_mamy_zrobic_z_nadplata'", "'brak_pola'")),
  ("state.repeating_mismatch", f"{NAZWA_PODATKU}.states[0]", lambda f: node(f, 1, 1).update(type="REPEATING_SECTION")),
  ("state.unknown_option", f"{NAZWA_PODATKU}.states[0]", lambda f: set_query(f, r'^\("[^"]*"', '("Nie ma takiej opcji"')),
  ("flow.missing", "flow", lambda f: f.pop("flow")),
  ("flow.unknown_page", "flow.links[0]", lambda f: f["flow"]["links"][0].update(target=str(uuid.uuid4()))),
  ("flow.unreachable", "tabs[2]", remove_middle_link),
  ("flow.dead_end", "tabs[1]", remove_middle_link),
]


@pytest.mark.parametrize(
  ("code", "path", "breaks"), BROKEN, ids=[f"{code}@{path}" for code, path, _ in BROKEN],
)
def test_broken_reference_is_reported(reference5, code, path, breaks):
  form = copy.deepcopy(reference5)
  breaks(form)
  new = violations(form) - KNOWN_REFERENCE_VIOLATIONS["5"]
  assert (code, path) in new, sorted(new)


def test_every_rule_has_a_broken_copy():
  source = (ROOT / "src/hacknation_2026/rules/check.py").read_text(encoding="utf-8")
  codes = set(re.findall(r'"([a-z_]+\.[a-z_]+)"', source))
  tested = {code for code, _, _ in BROKEN}
  untested = codes - tested - {"form.bad_value", "form.missing_key", "tab.bad_value", "tab.missing_key"}
  assert not untested, sorted(untested)


# --- domain rules that must NOT be reported ---------------------------------------------------------------------------

def test_finish_page_may_hold_text_block_and_info_section(reference5):
  form = copy.deepcopy(reference5)
  children = node(form, 3, 0)["repeatingSectionGrid"]
  info = fresh(children[0])
  info["field"].update(type="INFO_SECTION", techName="info")
  children.append(info)
  assert violations(form) == KNOWN_REFERENCE_VIOLATIONS["5"]


def test_editable_initial_data_only_for_mlpz_contact(reference5):
  form = copy.deepcopy(reference5)
  phone, email = node(form, 2, 0, 0), node(form, 2, 0, 1)
  assert (phone["defaultValue"], email["defaultValue"]) == ("MLPZ.phoneNumber", "MLPZ.email")
  assert phone["readOnly"] is False and email["readOnly"] is False
  assert violations(form) == KNOWN_REFERENCE_VIOLATIONS["5"]


def test_states_are_optional(reference5):
  form = copy.deepcopy(reference5)
  node(form, 1, 0).pop("states", None)
  node(form, 1, 0, 0).pop("states", None)
  assert violations(form) == KNOWN_REFERENCE_VIOLATIONS["5"]


def test_repeating_section_reference_resolves(reference5):
  form = copy.deepcopy(reference5)
  node(form, 1, 1).update(type="REPEATING_SECTION")
  node(form, 1, 1, 1)["states"][0]["query"] = (
    "(\"Zwrócić przelewem na rachunek bankowy\" in tabs['Informacje o nadpłacie' in title]"
    ".questions['rozliczenie_nadplaty' in field.techName].field.__userAnswer[$repeatingSectionIndex]"
    "['wybierz_co_mamy_zrobic_z_nadplata'in fieldTechName].answers)"
  )
  new = violations(form) - KNOWN_REFERENCE_VIOLATIONS["5"]
  assert ("state.repeating_mismatch", f"{NAZWA_PODATKU}.states[0]") not in new
  assert not {v for v in new if v[1] == f"{NAZWA_PODATKU}.states[0]"}


# --- robustness -------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("form", [
  {}, [], "x", {"title": "T", "tabs": "nie lista"}, {"title": "T", "tabs": [None, 1]},
  {"title": "T", "tabs": [{"id": "x", "type": "MAIN", "questions": [{"field": "zly"}, None]}], "flow": {"links": [1]}},
])
def test_malformed_input_returns_violations(form):
  result = check_form(form)
  assert result
