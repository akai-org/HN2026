"""Builder output vs. reference outputs 1 and 5 (structural comparison, ids ignored)."""

import re

import pytest

from hacknation_2026.builder import build_form
from hacknation_2026.builder.standard_sections import CONTACT_PAGE

from .conftest import load_reference, load_spec

# Known differences between references 1 and 5 that FormSpec cannot express:
# - reference 1 calls the contact page "Kontakt z urzędem" (FormSpec has no field for it; contract change requested),
# - reference 1 names the upload fields differently; the builder follows reference 5.
CONTACT_TITLE_1 = "Kontakt z urzędem"
RENAMED_FIELDS_1 = {
  "dokument_z_potwierdzeniem_podpisany_elektronicznie": "plik_dokumentu_z_pelnomocnictwem",
  "potwierdzenie_przelewu": "plik_z_potwierdzeniem_przelewu",
  "potwierdzenie_przelewu_2": "plik_z_potwierdzeniem_przelewu_2",
}
# Where the references contradict the specification, the specification wins (checked in test_builder_rules.py):
SPEC_OVERRIDES = {
  "FINISH page": "INFO_SECTION instead of TEXT_BLOCK (Reguły techniczne)",
  "initial data": "EXTERNAL_SYSTEM => readOnly, also the MLPZ address (Dane inicjalne); only the attributes in "
                  "initial_data.EDITABLE_INITIAL_DATA (MLPZ phone, e-mail; domain experts) are editable",
  "Twoje dane": "MLPZ.* as source and PESEL validator (Standardy), reference 5 uses PESEL.*",
  "Dane innej osoby": "has Numer PESEL (Standardy)",
  "Opłata skarbowa (wersja 2)": "title 'Opłata skarbowa' (Standardy), reference: 'Opłata skarbowa za pełnomonictwo'",
  "TERYT field": "readable label instead of the dictionary name as title",
  "validation": "REQUIRED and field validators filled (Reguły techniczne, Standardy); references leave it empty",
}
CASES = {
  5: ("form5_spec.json", {}, None),
  1: ("form1_spec.json", RENAMED_FIELDS_1, CONTACT_TITLE_1),
}


def normalize(states: list[dict] | None) -> list[tuple[str, str]]:
  return [(s["type"], re.sub(r"\s+", "", s["query"])) for s in states or []]


def fields_by_tech_name(section: dict) -> dict[str, dict]:
  return {item["field"]["techName"]: item["field"] for item in section["field"]["repeatingSectionGrid"]}


def tab(form: dict, title: str) -> dict:
  return next(t for t in form["tabs"] if t["title"] == title)


@pytest.fixture(params=sorted(CASES), ids=lambda n: f"form{n}")
def case(request, settings):
  spec_file, renamed, contact_title = CASES[request.param]
  return build_form(load_spec(spec_file), settings), load_reference(request.param), renamed, contact_title


def test_page_titles(case):
  form, reference, _, contact_title = case
  expected = [t["title"] for t in reference["tabs"]]
  if contact_title:
    expected = [CONTACT_PAGE if title == contact_title else title for title in expected]
  assert [t["title"] for t in form["tabs"]] == expected
  assert [t["type"] for t in form["tabs"]] == [t["type"] for t in reference["tabs"]]


def test_data_page_section_tech_names(case):
  form, reference, _, _ = case
  assert [q["field"]["techName"] for q in form["tabs"][0]["questions"]] == \
    [q["field"]["techName"] for q in reference["tabs"][0]["questions"]]


def test_standard_sections_match_reference(case):
  """Section states equal; every reference field exists with the same type and states (builder may add fields)."""
  form, reference, renamed, _ = case
  ours = {q["field"]["techName"]: q for q in form["tabs"][0]["questions"]}
  ours |= {q["field"]["techName"]: q for q in tab(form, CONTACT_PAGE)["questions"] if q["field"]["techName"] == "dane_do_kontaktu"}
  theirs = list(reference["tabs"][0]["questions"]) + [
    q for q in reference["tabs"][-2]["questions"] if q["field"]["techName"] == "dane_do_kontaktu"
  ]
  for ref_section in theirs:
    tech_name = ref_section["field"]["techName"]
    section = ours[tech_name]
    assert section["field"]["type"] == ref_section["field"]["type"], tech_name
    assert normalize(section["field"]["states"]) == normalize(ref_section["field"].get("states")), tech_name
    our_fields = fields_by_tech_name(section)
    for ref_name, ref_field in fields_by_tech_name(ref_section).items():
      name = renamed.get(ref_name, ref_name)
      assert name in our_fields, f"{tech_name}.{name}"
      assert our_fields[name]["type"] == ref_field["type"], f"{tech_name}.{name}"
      assert normalize(our_fields[name]["states"]) == normalize(ref_field.get("states")), f"{tech_name}.{name}"


def test_subject_pages_match_reference(case):
  form, reference, _, _ = case
  for ours, theirs in zip(form["tabs"][1:-2], reference["tabs"][1:-2], strict=True):
    assert ours["title"] == theirs["title"]
    for section, ref_section in zip(ours["questions"], theirs["questions"], strict=True):
      assert section["field"]["techName"] == ref_section["field"]["techName"]
      our_fields = fields_by_tech_name(section)
      for name, ref_field in fields_by_tech_name(ref_section).items():
        assert our_fields[name]["type"] == ref_field["type"], name
        assert [o["name"] for o in our_fields[name]["options"]] == [o["name"] for o in ref_field["options"]], name
        assert normalize(our_fields[name]["states"]) == normalize(ref_field["states"]), name


def test_finish_page_follows_rules_not_reference(case):
  """SPEC_OVERRIDES: the references use TEXT_BLOCK on FINISH; Reguły techniczne allow only INFO_SECTION there."""
  form, reference, _, _ = case
  ours, theirs = form["tabs"][-1], reference["tabs"][-1]
  assert ours["type"] == theirs["type"] == "FINISH"
  assert [c["field"]["type"] for q in theirs["questions"] for c in q["field"]["repeatingSectionGrid"]] == ["TEXT_BLOCK"]
  assert [c["field"]["type"] for q in ours["questions"] for c in q["field"]["repeatingSectionGrid"]] == ["INFO_SECTION"]
