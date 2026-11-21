"""Builder unit tests: shape of nodes, layout, JSONata, enrichment, flags."""

import uuid

import pytest

from hacknation_2026.builder import build, build_form, jsonata
from hacknation_2026.builder.layout import html_text, slug, unique
from hacknation_2026.contracts import Condition, FieldSpec, FormSpec, PageSpec, SectionSpec

from .conftest import StubEnrichment, load_spec

FIELD_KEYS = {
  "id", "type", "techName", "title", "description", "options", "validation", "readOnly",
  "repeatingSectionGrid", "states", "questionOrder", "tooltipMessage",
}


def walk(form):
  """(section item, field item or None) for every section and field."""
  for tab in form["tabs"]:
    for item in tab["questions"]:
      yield item, None
      for child in item["field"]["repeatingSectionGrid"]:
        yield item, child


def minimal_spec(**kw) -> FormSpec:
  return FormSpec(title=kw.pop("title", "Wniosek o coś"), pages=kw.pop("pages", []), **kw)


@pytest.fixture
def form5(settings):
  return build_form(load_spec("form5_spec.json"), settings)


# --- slug / html ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("label, expected", [
  ("Adres e-mail", "adres_e_mail"),
  ("Wybierz, co mamy zrobić z nadpłatą", "wybierz_co_mamy_zrobic_z_nadplata"),
  ("Źródło ŁĄKI óśćń", "zrodlo_laki_oscn"),
  ("  ", "pole"),
])
def test_slug(label, expected):
  assert slug(label) == expected


def test_unique():
  taken: set[str] = set()
  assert [unique("a", taken) for _ in range(3)] == ["a", "a_2", "a_3"]


def test_html_text_escapes_and_splits_paragraphs():
  assert html_text("a < b\n\nc") == "<html><head></head><body><p>a &lt; b</p><p>c</p></body></html>"
  assert html_text("") == "<html><head></head><body></body></html>"


# --- jsonata ---------------------------------------------------------------------------------------------------------

def test_jsonata_query_shape():
  path = jsonata.answer_path("Dane", "sekcja", "pole")
  assert jsonata.equals("Tak", path) == (
    "(\"Tak\" in tabs['Dane' in title].questions['sekcja' in field.techName]"
    ".field.repeatingSectionGrid['pole' in field.techName].field.__userAnswer)"
  )
  assert jsonata.not_("(x)") == "$not(x)"
  assert jsonata.and_("(a)", "(b)") == "(a) and (b)"
  assert jsonata.or_("(a)", jsonata.group("(b) and (c)")) == "(a) or ((b) and (c))"
  assert jsonata.or_("", "(b)") == "(b)"
  assert jsonata.show("") == []


# --- structure -------------------------------------------------------------------------------------------------------

def test_every_node_has_full_key_set(form5):
  ids = []
  for section, child in walk(form5):
    node = (child or section)["field"]
    assert FIELD_KEYS <= node.keys(), node["techName"]
    uuid.UUID(node["id"], version=4)
    ids.append(node["id"])
    if child is None:
      assert node["type"] in {"SECTION", "REPEATING_SECTION"}
      assert node["description"].startswith("<html><head></head><body>")
    else:
      assert node["repeatingSectionGrid"] == []
  assert len(ids) == len(set(ids))


def test_layout(form5):
  for tab in form5["tabs"]:
    y = 0
    for order, item in enumerate(tab["questions"]):
      assert (item["x"], item["y"], item["cols"]) == (0, y, 3)
      assert item["field"]["questionOrder"] == order
      grid = item["field"]["repeatingSectionGrid"]
      assert item["rows"] == len(grid) + 1
      y += item["rows"]
      for index, child in enumerate(grid):
        assert (child["x"], child["y"], child["rows"], child["cols"]) == (0, index, 1, 3)
        assert child["field"]["questionOrder"] == index


def test_tech_names_unique_within_containers(form5):
  for tab in form5["tabs"]:
    names = [q["field"]["techName"] for q in tab["questions"]]
    assert len(names) == len(set(names))
    for q in tab["questions"]:
      fields = [c["field"]["techName"] for c in q["field"]["repeatingSectionGrid"]]
      assert len(fields) == len(set(fields))


def test_flow_links_pages_linearly(form5):
  ids = [t["id"] for t in form5["tabs"]]
  assert [(link["source"], link["target"]) for link in form5["flow"]["links"]] == list(zip(ids, ids[1:]))
  assert form5["tabs"][-1]["type"] == "FINISH"
  assert all(t["type"] == "MAIN" for t in form5["tabs"][:-1])


def test_authority_field(form5):
  authority = form5["tabs"][0]["questions"][0]["field"]["repeatingSectionGrid"][0]["field"]
  assert authority["defaultValue"] == "Urząd Gminy Ulan-Majorat"
  assert authority["readOnly"] is True


def test_address_has_country_and_teryt(form5):
  address = next(q for q in form5["tabs"][0]["questions"] if q["field"]["techName"] == "adres_zamieszkania")
  fields = {c["field"]["techName"]: c["field"] for c in address["field"]["repeatingSectionGrid"]}
  assert fields["kraj"]["dictionaryName"] == "Kraje" and fields["kraj"]["searchEnabled"] is True
  assert fields["kraj"]["defaultValue"] == ["Polska"]
  teryt = fields["wojewodztwo"]
  assert (teryt["type"], teryt["dictionaryName"], teryt["multiLevelTree"]) == ("SELECT", "TERYT_4G_DOWODOWY", True)


def test_consent_section_uses_spec_consents(settings):
  form = build_form(minimal_spec(consents=["Oświadczam, że dane są prawdziwe.", "Zgoda B"]), settings)
  consent = form["tabs"][-2]["questions"][-1]["field"]["repeatingSectionGrid"][0]["field"]
  assert consent["type"] == "CONSENT_SECTION"
  consents = consent["consentSectionConfig"]["consents"]
  assert len(consents) == 3 and all(c["required"] for c in consents)
  assert "klauzulą informacyjną" in consents[0]["description"]   # standard consent kept, statements added after it
  assert "Oświadczam" in consents[1]["description"]


def test_default_consent_is_not_duplicated(settings):
  from hacknation_2026.builder.standard_sections import DEFAULT_CONSENT
  form = build_form(minimal_spec(consents=[DEFAULT_CONSENT]), settings)
  consent = form["tabs"][-2]["questions"][-1]["field"]["repeatingSectionGrid"][0]["field"]
  assert len(consent["consentSectionConfig"]["consents"]) == 1


def test_default_consent(settings):
  form = build_form(minimal_spec(), settings)
  consent = form["tabs"][-2]["questions"][-1]["field"]["repeatingSectionGrid"][0]["field"]
  assert "klauzulą informacyjną" in consent["consentSectionConfig"]["consents"][0]["description"]


# --- flags -----------------------------------------------------------------------------------------------------------

def test_no_flags_gives_only_applicant_sections(settings):
  form = build_form(minimal_spec(), settings)
  assert [q["field"]["techName"] for q in form["tabs"][0]["questions"]] == [
    "urzad_do_ktorego_jest_skladany_wniosek", "twoje_dane", "adres_zamieszkania",
  ]
  assert [t["title"] for t in form["tabs"]] == ["Dane", "Kontakt i zgody", "Strona końcowa"]


def test_other_person_only(settings):
  form = build_form(minimal_spec(allows_other_person=True), settings)
  sections = {q["field"]["techName"]: q["field"] for q in form["tabs"][0]["questions"]}
  assert "dane_podmiotu" not in sections and "oplata_skarbowa_pelnomocnictwo_2" not in sections
  subject = sections["podmiot_wniosku"]["repeatingSectionGrid"]
  assert len(subject) == 1
  assert [o["name"] for o in subject[0]["field"]["options"]] == ["Swoim", "Innej osoby"]
  query = sections["pelnomocnictwo"]["states"][0]["query"]
  assert "Innej osoby" in query and " or " not in query


def test_legal_entity_only(settings):
  form = build_form(minimal_spec(allows_legal_entity=True), settings)
  sections = {q["field"]["techName"]: q["field"] for q in form["tabs"][0]["questions"]}
  assert "dane_innej_osoby" not in sections and "oplata_skarbowa_pelnomocnictwo_1" not in sections
  query = sections["pelnomocnictwo"]["states"][0]["query"]
  assert "Pełnomocnik" in query and " and " in query and "Innej osoby" not in query


def test_document_kind_and_organ(settings):
  spec = minimal_spec(title="Deklaracja o wysokości opłaty", authority_kind="ORGAN", authority_name="Wójt")
  form = build_form(spec, settings)
  assert form["tabs"][0]["questions"][0]["field"]["title"] == "Organ, do którego jest składana deklaracja"
  subject = form["tabs"][0]["questions"]
  assert all(q["field"]["techName"] != "podmiot_wniosku" for q in subject)
  form = build_form(spec.model_copy(update={"allows_legal_entity": True}), settings)
  labels = [c["field"]["title"] for c in form["tabs"][0]["questions"][1]["field"]["repeatingSectionGrid"]]
  assert labels == ["Wybierz, w czyim imieniu deklarujesz", "Wybierz, jako kto deklarujesz"]
  assert form["tabs"][-1]["questions"][0]["field"]["title"] == "Podgląd"


# --- subject pages, conditions, enrichment ---------------------------------------------------------------------------

def subject_spec(**field_kw) -> FormSpec:
  return minimal_spec(pages=[PageSpec(title="Sprawa", sections=[SectionSpec(key="s", title="Sekcja", fields=[
    FieldSpec(key="wybor", label="Wybór", type="RADIO", required=True, options=["A", "B"]),
    FieldSpec(key="kraj_pochodzenia", label="Kraj pochodzenia", type="SELECT", required=False, **field_kw),
  ])])])


def test_conditions_and_unknown_fields_dropped(settings):
  spec = subject_spec(show_if=[Condition(field="wybor", equals="A"), Condition(field="nie_ma", equals="X")])
  field = build_form(spec, settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"][1]["field"]
  assert field["states"] == [{"type": "SHOW", "query": jsonata.equals("A", jsonata.answer_path("Sprawa", "s", "wybor"))}]


def test_and_conditions(settings):
  spec = subject_spec(show_if=[Condition(field="wybor", equals="A"), Condition(field="wybor", equals="B")])
  field = build_form(spec, settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"][1]["field"]
  assert field["states"][0]["query"].count(" and ") == 1


def test_enrichment_is_applied_to_subject_fields(settings, monkeypatch):
  def enrich_field(label, field_type, required, applicant_data):
    if label == "Kraj pochodzenia":
      return StubEnrichment(dictionary_name="Kraje", search_enabled=True)
    if label == "Wybór":
      return StubEnrichment(default_value="MLPZ.email", external=True, validators=["EMAIL", "PATTERN"])
    return StubEnrichment()

  monkeypatch.setattr(build, "enrich_field", enrich_field)
  section = build_form(subject_spec(), settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"]
  wybor, kraj = (item["field"] for item in section)
  assert kraj["dictionaryName"] == "Kraje" and kraj["searchEnabled"] is True
  assert wybor["defaultValue"] == "MLPZ.email" and wybor["defaultValueType"] == "EXTERNAL_SYSTEM"
  assert wybor["readOnly"] is True, "initial data => read-only (Dane inicjalne)"
  assert wybor["validation"] == ["REQUIRED", "EMAIL"], "only validators from Reguły techniczne"


def test_enrichment_can_turn_text_field_into_select(settings, monkeypatch):
  def enrich_field(label, field_type, required, applicant_data):
    if field_type == "TEXT_FIELD":
      return StubEnrichment(dictionary_name="Kraje", search_enabled=True, field_type="SELECT")
    return StubEnrichment(field_type="DATEPICKER")  # ignored: only a TEXT_FIELD changes its type

  monkeypatch.setattr(build, "enrich_field", enrich_field)
  spec = minimal_spec(pages=[PageSpec(title="Sprawa", sections=[SectionSpec(key="s", title="Sekcja", fields=[
    FieldSpec(key="kraj", label="Kraj", type="TEXT_FIELD", required=True),
    FieldSpec(key="wybor", label="Wybór", type="RADIO", required=True, options=["A", "B"]),
  ])])])
  section = build_form(spec, settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"]
  kraj, wybor = (item["field"] for item in section)
  assert kraj["type"] == "SELECT" and kraj["dictionaryName"] == "Kraje" and kraj["options"] == []
  assert wybor["type"] == "RADIO"


def test_enrichment_dictionary_skipped_when_field_has_own_options(settings, monkeypatch):
  monkeypatch.setattr(build, "enrich_field", lambda *_: StubEnrichment(dictionary_name="Kraje", search_enabled=True))
  kraj = build_form(subject_spec(options=["Polska", "Niemcy", "Inny"]), settings)["tabs"][1]["questions"][0]
  kraj = kraj["field"]["repeatingSectionGrid"][1]["field"]
  assert "dictionaryName" not in kraj, "the paper form's options win over a dictionary guessed from the label"
  assert [option["name"] for option in kraj["options"]] == ["Polska", "Niemcy", "Inny"]


def test_applicant_data_is_passed_to_enrichment(settings, stub_enrichment):
  spec = minimal_spec(pages=[PageSpec(title="Sprawa", sections=[SectionSpec(key="s", title="Sekcja", fields=[
    FieldSpec(key="data_urodzenia", label="Data urodzenia", type="DATEPICKER", required=True, applicant_data=True),
  ])])])
  build_form(spec, settings)
  assert ("Data urodzenia", "DATEPICKER", True, True) in stub_enrichment


def test_standard_fields_are_not_enriched(settings, stub_enrichment):
  build_form(load_spec("form5_spec.json"), settings)
  labels = {label for label, *_ in stub_enrichment}
  assert labels == {f.label for p in load_spec("form5_spec.json").pages for s in p.sections for f in s.fields}
  assert not any(applicant_data for *_, applicant_data in stub_enrichment)


def test_required_without_enrichment_gets_required_validator(settings):
  form = build_form(subject_spec(), settings)
  wybor = form["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"][0]["field"]
  assert wybor["validation"] == ["REQUIRED"]


def test_validators_can_be_disabled(settings):
  settings.emit_validators = False
  form = build_form(load_spec("form5_spec.json"), settings)
  assert all((child or section)["field"]["validation"] == [] for section, child in walk(form))


def test_text_block_from_spec(settings):
  spec = minimal_spec(pages=[PageSpec(title="P", sections=[SectionSpec(key="s", title="S", fields=[
    FieldSpec(key="info", label="Pouczenie", type="TEXT_BLOCK", required=True, description="Treść pouczenia"),
  ])])])
  block = build_form(spec, settings)["tabs"][1]["questions"][0]["field"]["repeatingSectionGrid"][0]["field"]
  assert block["title"] == "" and "Treść pouczenia" in block["description"] and block["validation"] == []
