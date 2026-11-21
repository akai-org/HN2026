"""The builder against the specification in dane_zadania/materialy (not against the reference JSONs).

Sources: Reguły techniczne (RT), Opis importowanego pliku JSON (OPIS), Standardy (STD), Słowniki (SL),
Dane inicjalne (DI).
"""

import pytest

from hacknation_2026 import initial_data
from hacknation_2026.builder import build_form, jsonata
from hacknation_2026.builder.build import VALIDATORS
from hacknation_2026.contracts import Condition, FieldSpec, FormSpec, PageSpec, SectionSpec

from .conftest import load_spec

INPUT_TYPES = {"TEXT_FIELD", "TEXTAREA", "NUMBER", "DATEPICKER", "RADIO", "CHECKBOX", "SELECT", "FILE_UPLOADER"}
CHOICE_TYPES = {"RADIO", "CHECKBOX", "SELECT"}


@pytest.fixture(params=["form5_spec.json", "form1_spec.json"])
def form(request, settings):
  return build_form(load_spec(request.param), settings)


def fields(form):
  for tab in form["tabs"]:
    for item in tab["questions"]:
      for child in item["field"]["repeatingSectionGrid"]:
        yield tab, item["field"], child["field"]


def section_of(form, tech_name):
  return next(q["field"] for t in form["tabs"] for q in t["questions"] if q["field"]["techName"] == tech_name)


# --- Reguły techniczne / Opis JSON -----------------------------------------------------------------------------------

def test_pages_types_and_flow(form):
  """RT: min. 2 pages, the last is FINISH, others MAIN, pages linked by flow; every page has a field."""
  assert len(form["tabs"]) >= 2
  assert [t["type"] for t in form["tabs"]] == ["MAIN"] * (len(form["tabs"]) - 1) + ["FINISH"]
  assert len(form["flow"]["links"]) == len(form["tabs"]) - 1
  for tab in form["tabs"]:
    assert any(q["field"]["repeatingSectionGrid"] for q in tab["questions"]), tab["title"]


def test_fields_in_sections_without_nesting(form):
  """RT: every field sits in a (repeating) section; sections are not nested."""
  for tab in form["tabs"]:
    for item in tab["questions"]:
      assert item["field"]["type"] in {"SECTION", "REPEATING_SECTION"}
      for child in item["field"]["repeatingSectionGrid"]:
        assert child["field"]["type"] not in {"SECTION", "REPEATING_SECTION"}


def test_finish_page_has_only_info_section(form):
  """RT: on the FINISH page only an INFO_SECTION field; it needs techName and description."""
  finish = form["tabs"][-1]
  for item in finish["questions"]:
    for child in item["field"]["repeatingSectionGrid"]:
      assert child["field"]["type"] == "INFO_SECTION"
      assert child["field"]["techName"] and "<p>" in child["field"]["description"]


def test_validators_and_required_attribute(form):
  """RT: validators only from the list; input fields with required data carry REQUIRED; none on presentational types."""
  for _, _, field in fields(form):
    assert set(field["validation"]) <= set(VALIDATORS), field["techName"]
    if field["type"] not in INPUT_TYPES:
      assert field["validation"] == [], field["techName"]


def test_initial_data_is_read_only(form):
  """DI: a field fed with initial data is read-only, with defaultValueType EXTERNAL_SYSTEM and 'SOURCE.attribute';
  domain experts: attributes that may be outdated in the register (EDITABLE_INITIAL_DATA) are editable."""
  external = [f for _, _, f in fields(form) if f.get("defaultValueType") == "EXTERNAL_SYSTEM"]
  assert external
  for field in external:
    assert initial_data.is_known(field["defaultValue"]), field["defaultValue"]
    assert field["readOnly"] is not initial_data.is_editable(field["defaultValue"]), field["techName"]
  read_only = {f["defaultValue"]: f["readOnly"] for f in external}
  assert read_only["MLPZ.phoneNumber"] is False and read_only["MLPZ.email"] is False
  assert read_only["MLPZ.name"] is True and read_only["MLPZ.postCode"] is True


def test_dictionaries(form):
  """RT/SL: dictionaries only on SELECT/RADIO/CHECKBOX, with empty options; Kraje and TERYT only on SELECT."""
  for _, _, field in fields(form):
    if "dictionaryName" in field:
      assert field["type"] in CHOICE_TYPES and field["options"] == [], field["techName"]
      if field["dictionaryName"] in {"Kraje", "TERYT_4G_DOWODOWY"}:
        assert field["type"] == "SELECT"


def test_options_shape(form):
  """OPIS: options are {id, name, techName}."""
  for _, _, field in fields(form):
    for option in field["options"]:
      assert set(option) == {"id", "name", "techName"}


def test_consent_section_config(form):
  """RT: consents[] = {description, required}; OPIS/schema: required and files on the config."""
  consent = next(f for _, _, f in fields(form) if f["type"] == "CONSENT_SECTION")
  config = consent["consentSectionConfig"]
  assert all(set(c) == {"description", "required"} for c in config["consents"])
  assert config["required"] is True and config["files"] == []


def test_title_is_limited(settings):
  """RT: form title max 255 characters."""
  form = build_form(FormSpec(title="Wniosek " + "x" * 400, pages=[]), settings)
  assert len(form["title"]) == 255


def test_empty_sections_and_pages_are_dropped(settings):
  """RT: every page contains at least one field."""
  spec = FormSpec(title="Wniosek o coś", pages=[
    PageSpec(title="Pusta", sections=[SectionSpec(key="s", title="S", fields=[])]),
    PageSpec(title="Sprawa", sections=[
      SectionSpec(key="pusta", title="Pusta", fields=[]),
      SectionSpec(key="s", title="S", fields=[FieldSpec(key="a", label="A", type="TEXT_FIELD", required=True)]),
    ]),
  ])
  form = build_form(spec, settings)
  assert [t["title"] for t in form["tabs"]] == ["Dane", "Sprawa", "Kontakt i zgody", "Strona końcowa"]
  assert [q["field"]["techName"] for q in form["tabs"][1]["questions"]] == ["s"]


def test_condition_on_repeating_section_uses_repeating_path(settings):
  """RT: answers in a repeating section are read via __userAnswer[$repeatingSectionIndex][...].answers."""
  spec = FormSpec(title="Wniosek o coś", pages=[PageSpec(title="Sprawa", sections=[
    SectionSpec(key="osoby", title="Osoby", repeating=True, fields=[
      FieldSpec(key="rola", label="Rola", type="RADIO", required=True, options=["Właściciel", "Inna"]),
      FieldSpec(key="opis", label="Opis", type="TEXTAREA", required=False, show_if=[Condition(field="rola", equals="Inna")]),
    ]),
  ])])
  section = build_form(spec, settings)["tabs"][1]["questions"][0]["field"]
  assert section["type"] == "REPEATING_SECTION"
  query = section["repeatingSectionGrid"][1]["field"]["states"][0]["query"]
  assert query == '("Inna" in ' + jsonata.repeating_answer_path("Sprawa", "osoby", "rola") + ")"
  assert "__userAnswer[$repeatingSectionIndex]['rola' in fieldTechName].answers" in query


def test_choice_type_by_number_of_options(settings):
  """STD: dropdown when more than 5 options; search when more than 15."""
  many = [f"Opcja {i}" for i in range(20)]
  spec = FormSpec(title="Wniosek o coś", pages=[PageSpec(title="Sprawa", sections=[SectionSpec(key="s", title="S", fields=[
    FieldSpec(key="a", label="A", type="RADIO", required=True, options=many[:6]),
    FieldSpec(key="b", label="B", type="SELECT", required=True, options=many),
    FieldSpec(key="c", label="C", type="RADIO", required=True, options=many[:5]),
  ])])])
  a, b, c = (i["field"] for i in build_form(spec, settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"])
  assert (a["type"], a.get("searchEnabled")) == ("SELECT", None)
  assert (b["type"], b["searchEnabled"]) == ("SELECT", True)
  assert c["type"] == "RADIO"


# --- Standardy: predefined sections ---------------------------------------------------------------------------------

PL, ABROAD = "PL", "ABROAD"
# techName: (type, title, validators, initial data, visibility)
APPLICANT_ADDRESS = {
  "kraj": ("SELECT", "Kraj", ["REQUIRED"], None, None),
  "miejscowosc_zagranica": ("TEXT_FIELD", "Miejscowość", ["REQUIRED"], None, ABROAD),
  "kod_pocztowy_zagranica": ("TEXT_FIELD", "Kod pocztowy", [], None, ABROAD),
  "ulica_zagranica": ("TEXT_FIELD", "Ulica", [], None, ABROAD),
  "wojewodztwo": ("SELECT", "Województwo, powiat, gmina, miejscowość", ["REQUIRED"], None, PL),
  "kod_pocztowy": ("TEXT_FIELD", "Kod pocztowy", ["REQUIRED", "ZIP_CODE"], "MLPZ.postCode", PL),
  "ulica": ("TEXT_FIELD", "Ulica", [], "MLPZ.street", PL),
  "numer_budynku": ("TEXT_FIELD", "Numer budynku", ["REQUIRED"], "MLPZ.building", None),
  "numer_lokalu": ("TEXT_FIELD", "Numer lokalu", [], "MLPZ.apartment", None),
}
STANDARD = {
  "twoje_dane": {
    "imie": ("TEXT_FIELD", "Imię", ["REQUIRED"], "MLPZ.name", None),
    "nazwisko": ("TEXT_FIELD", "Nazwisko", ["REQUIRED"], "MLPZ.surname", None),
    "numer_pesel": ("TEXT_FIELD", "Numer PESEL", ["REQUIRED", "PESEL"], "MLPZ.pesel", None),
  },
  "adres_zamieszkania": APPLICANT_ADDRESS,
  "dane_innej_osoby": {
    "imie_inna_osoba": ("TEXT_FIELD", "Imię", ["REQUIRED"], None, None),
    "nazwisko_inna_osoba": ("TEXT_FIELD", "Nazwisko", ["REQUIRED"], None, None),
    "numer_pesel_inna_osoba": ("TEXT_FIELD", "Numer PESEL", ["REQUIRED", "PESEL"], None, None),
  },
  "dane_podmiotu": {
    "nazwa": ("TEXT_FIELD", "Nazwa", ["REQUIRED"], None, None),
    "nip": ("TEXT_FIELD", "NIP", ["REQUIRED", "NIP"], None, None),
    "regon": ("TEXT_FIELD", "REGON", ["REQUIRED", "REGON"], None, None),
    "numer_krs": ("TEXT_FIELD", "Numer KRS", [], None, None),
  },
  "pelnomocnictwo": {
    "plik_dokumentu_z_pelnomocnictwem": ("FILE_UPLOADER", "Plik dokumentu z pełnomocnictwem", ["REQUIRED"], None, None),
  },
  "dane_do_kontaktu": {
    "numer_telefonu": ("TEXT_FIELD", "Numer telefonu", [], "MLPZ.phoneNumber", None),
    "adres_e_mail": ("TEXT_FIELD", "Adres e-mail", ["EMAIL"], "MLPZ.email", None),
  },
}


@pytest.mark.parametrize("section_name", sorted(STANDARD))
def test_standard_section_fields(form, section_name):
  section = section_of(form, section_name)
  grid = {i["field"]["techName"]: i["field"] for i in section["repeatingSectionGrid"]}
  assert list(grid) == list(STANDARD[section_name]), "fields and order as in Standardy"
  country = jsonata.answer_path("Dane", section_name, "kraj")
  for name, (type_, title, validators, initial, visibility) in STANDARD[section_name].items():
    field = grid[name]
    assert (field["type"], field["title"], field["validation"]) == (type_, title, validators), name
    assert field.get("defaultValue") == initial if initial else field.get("defaultValueType") is None, name
    expected = {
      None: [],
      PL: jsonata.show(jsonata.equals("Polska", country)),
      ABROAD: jsonata.show(jsonata.not_(jsonata.equals("Polska", country))),
    }[visibility]
    assert field["states"] == expected, name


def test_address_dictionaries(form):
  """STD: Kraj with search, dictionary Kraje, default Polska; Poland: TERYT_4G_DOWODOWY multi-level list with search."""
  grid = {i["field"]["techName"]: i["field"] for i in section_of(form, "adres_zamieszkania")["repeatingSectionGrid"]}
  assert (grid["kraj"]["dictionaryName"], grid["kraj"]["searchEnabled"], grid["kraj"]["defaultValue"]) == ("Kraje", True, ["Polska"])
  teryt = grid["wojewodztwo"]
  assert (teryt["dictionaryName"], teryt["multiLevelTree"], teryt["searchEnabled"]) == ("TERYT_4G_DOWODOWY", True, True)


def test_other_addresses_have_no_initial_data(form):
  """DI/STD: initial data only for the logged-in user's own data."""
  for name in ("adres_siedziby", "adres_zamieszkania_osoby_ktorej_jestes_pelnomocnikiem"):
    assert all("defaultValueType" not in i["field"] for i in section_of(form, name)["repeatingSectionGrid"])


def test_section_titles_and_descriptions(form):
  """STD: titles of predefined sections and the descriptions they prescribe."""
  titles = {q["field"]["techName"]: q["field"]["title"] for t in form["tabs"] for q in t["questions"]}
  assert titles["oplata_skarbowa_pelnomocnictwo_1"] == titles["oplata_skarbowa_pelnomocnictwo_2"] == "Opłata skarbowa"
  assert titles["podglad"] == "Podgląd" and titles["zgoda"] == "Zgoda"
  assert "jesteś pełnomocnikiem" in section_of(form, "pelnomocnictwo")["description"]
  assert "najbliższą rodzinę" in section_of(form, "oplata_skarbowa_pelnomocnictwo_1")["description"]
  assert "przyspieszyć załatwienie sprawy" in section_of(form, "dane_do_kontaktu")["description"]
  duty = section_of(form, "oplata_skarbowa_pelnomocnictwo_2")["repeatingSectionGrid"][0]["field"]
  assert "17 zł" in duty["description"] and form["title"] in duty["description"]


def test_subject_section_options(form):
  """STD: Podmiot wniosku – radio with Swoim/Innej osoby/Osoby prawnej..., role radio visible only for legal entities."""
  whose, role = (i["field"] for i in section_of(form, "podmiot_wniosku")["repeatingSectionGrid"])
  assert [o["name"] for o in whose["options"]] == ["Swoim", "Innej osoby", "Osoby prawnej lub jednostki organizacyjnej"]
  assert [o["name"] for o in role["options"]] == ["Pełnomocnik", "Reprezentant"]
  assert whose["validation"] == role["validation"] == ["REQUIRED"]
  assert "Osoby prawnej lub jednostki organizacyjnej" in role["states"][0]["query"]


@pytest.mark.parametrize("consents, title", [
  ([], "Zgoda"),
  (["Oświadczam, że dane są zgodne z prawdą."], "Oświadczenie"),
  (["Oświadczam, że dane są zgodne z prawdą.", "Wyrażam zgodę na kontakt."], "Zgody i oświadczenia"),
])
def test_consent_section_title(settings, consents, title):
  """STD: section title matches its content."""
  form = build_form(FormSpec(title="Wniosek o coś", pages=[], consents=consents), settings)
  section = form["tabs"][-2]["questions"][-1]["field"]
  assert section["title"] == title
  config = section["repeatingSectionGrid"][0]["field"]["consentSectionConfig"]
  assert config.get("selectAllEnabled", False) is (len(consents) > 1)
