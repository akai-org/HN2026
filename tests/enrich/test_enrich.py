"""Block E: field enrichment from the label, checked against the documents in dane_zadania/materialy/."""

from collections import Counter

import pytest

from hacknation_2026.builder import build_form
from hacknation_2026.config import Settings
from hacknation_2026.contracts import FieldSpec, FormSpec, PageSpec, SectionSpec
from hacknation_2026.enrich import catalog, enrich_field, normalize, proposed_dictionaries


def test_normalize():
  assert normalize("Adres e-mail / ePUAP") == "adres e mail epuap"
  assert normalize("Łódź, ŻÓŁTA Źródłowa 5") == "lodz zolta zrodlowa 5"


def test_catalog_follows_the_documents():
  # Dane inicjalne: 16 attributes of the PESEL register, 18 of the registered address, 17 of the logged-in user
  assert Counter(a.source for a in catalog.ATTRIBUTES.values()) == {"PESEL": 16, "PESEL_ADDRESS": 18, "MLPZ": 17}
  assert set(catalog.SOURCES) == {"PESEL", "PESEL_ADDRESS", "MLPZ"}
  assert {r.value for r in catalog.INITIAL_DATA_RULES} <= set(catalog.ATTRIBUTES)
  for prefix in (catalog.TEMPORARY_PREFIX, catalog.PERMANENT_PREFIX):
    assert {prefix + r.value for r in catalog.REGISTERED_ADDRESS_RULES} <= set(catalog.ATTRIBUTES)
  # Reguły techniczne: only validators from the allowed list
  assert {r.value for r in catalog.VALIDATOR_RULES} <= set(catalog.VALIDATORS)
  # Standardy name these two; the rest of the example dictionaries has no technical name in the documents
  assert {d.value for d in catalog.DICTIONARIES} == {"Kraje", "TERYT_4G_DOWODOWY"}
  # every phrase is already normalized, otherwise it could never match
  rules = [*catalog.INITIAL_DATA_RULES, *catalog.REGISTERED_ADDRESS_RULES, *catalog.VALIDATOR_RULES, *catalog.DICTIONARIES]
  assert all(normalize(p) == p for rule in rules for p in rule.phrases)


def test_spec_example():
  enrichment = enrich_field("Adres e-mail", "TEXT_FIELD", False, True)
  assert enrichment.default_value == "MLPZ.email" and enrichment.external and enrichment.read_only
  assert enrichment.validators == ["EMAIL"]


# --- validators -------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("label,field_type,required,expected", [
  ("Numer PESEL", "TEXT_FIELD", True, ["REQUIRED", "PESEL"]),
  ("NIP", "TEXT_FIELD", False, ["NIP"]),
  ("Numer REGON", "TEXT_FIELD", False, ["REGON"]),
  ("Adres e-mail", "TEXT_FIELD", False, ["EMAIL"]),
  ("Adres poczty elektronicznej", "TEXT_FIELD", False, ["EMAIL"]),
  ("Kod pocztowy", "TEXT_FIELD", True, ["REQUIRED", "ZIP_CODE"]),
  ("Zagraniczny kod pocztowy", "TEXT_FIELD", False, []),           # Standardy: no validation outside Poland
  ("Adres skrytki ePUAP", "TEXT_FIELD", False, ["EPUAP"]),
  ("Adres do doręczeń elektronicznych", "TEXT_FIELD", False, ["ADE"]),
  ("Seria i numer dowodu osobistego", "TEXT_FIELD", False, ["SERIAL_NUMBER_ID_CARD"]),
  ("Organ wydający dowód osobisty", "TEXT_FIELD", False, []),       # not the card's number
  ("NIP lub PESEL", "TEXT_FIELD", False, []),                       # alternatives: no single format fits
  ("Numer PESEL", "NUMBER", False, []),  # Reguły techniczne: NUMBER takes only REQUIRED
  ("Czy posiadasz numer PESEL?", "RADIO", True, ["REQUIRED"]),      # format validators only for typed text
  ("Numer KRS", "TEXT_FIELD", False, []),                           # Standardy want a regex, not an allowed validator
  ("Opis sprawy", "TEXTAREA", True, ["REQUIRED"]),
])
def test_validators(label, field_type, required, expected):
  assert enrich_field(label, field_type, required, False).validators == expected


# --- initial data -----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("label,field_type,value,new_type", [
  ("Imię", "TEXT_FIELD", "MLPZ.name", None),
  ("Drugie imię", "TEXT_FIELD", "MLPZ.secondName", None),
  ("Nazwisko", "TEXT_FIELD", "MLPZ.surname", None),
  ("Numer PESEL", "TEXT_FIELD", "MLPZ.pesel", None),
  ("Numer telefonu", "TEXT_FIELD", "MLPZ.phoneNumber", None),
  ("Adres e-mail", "TEXT_FIELD", "MLPZ.email", None),
  ("Kod pocztowy", "TEXT_FIELD", "MLPZ.postCode", None),
  ("Ulica", "TEXT_FIELD", "MLPZ.street", None),
  ("Numer budynku", "TEXT_FIELD", "MLPZ.building", None),
  ("Numer lokalu", "TEXT_FIELD", "MLPZ.apartment", None),
  ("Data urodzenia", "DATEPICKER", "PESEL.birthDate", None),
  ("Data urodzenia", "TEXT_FIELD", "PESEL.birthDate", "DATEPICKER"),  # Dane inicjalne: the attribute is a datepicker
  ("Miejsce urodzenia", "TEXT_FIELD", "PESEL.birthPlace", None),
  ("Kraj urodzenia", "TEXT_FIELD", "PESEL.birthCountry", None),
  ("Obywatelstwo", "TEXT_FIELD", "PESEL.citizenship", None),
  ("Imię matki", "TEXT_FIELD", "PESEL.motherName", None),           # the longer phrase wins over "Imię"
  ("Imię ojca", "TEXT_FIELD", "PESEL.fatherName", None),
  ("Nazwisko rodowe", "TEXT_FIELD", "PESEL.familyName", None),
  ("Stan cywilny", "TEXT_FIELD", "PESEL.maritalStatus", None),
  ("Ulica (adres stałego zameldowania)", "TEXT_FIELD", "PESEL_ADDRESS.permanentAddressStreet", None),
  ("Typ ulicy – adres zameldowania", "TEXT_FIELD", "PESEL_ADDRESS.permanentAddressStreetType", None),
  ("Kod pocztowy tymczasowego zameldowania", "TEXT_FIELD", "PESEL_ADDRESS.temporaryAddressPostalCode", None),
])
def test_initial_data_for_the_applicant(label, field_type, value, new_type):
  enrichment = enrich_field(label, field_type, False, True)
  assert enrichment.default_value == value
  assert enrichment.external and enrichment.read_only, "Dane inicjalne: a field fed from a register is read-only"
  assert enrichment.field_type == new_type
  assert enrichment.dictionary_name is None


@pytest.mark.parametrize("label,field_type,applicant_data", [
  ("Adres e-mail", "TEXT_FIELD", False),           # not marked as the applicant's own data
  ("PESEL małżonka", "TEXT_FIELD", True),          # another person
  ("Nazwisko rodowe matki", "TEXT_FIELD", True),   # the mother's data; no such attribute
  ("Imię i nazwisko", "TEXT_FIELD", True),         # two attributes in one field
  ("Numer budynku i lokalu", "TEXT_FIELD", True),
  ("Data urodzenia", "NUMBER", True),              # the type does not fit the attribute
  ("Numer działki", "TEXT_FIELD", True),           # no attribute
])
def test_no_initial_data(label, field_type, applicant_data):
  enrichment = enrich_field(label, field_type, True, applicant_data)
  assert enrichment.default_value is None and not enrichment.external and not enrichment.read_only


def test_other_person_keeps_validators():
  assert enrich_field("PESEL małżonka", "TEXT_FIELD", True, True).validators == ["REQUIRED", "PESEL"]


# --- dictionaries -----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("label,field_type,dictionary,tree,new_type", [
  ("Kraj", "SELECT", "Kraje", False, None),
  ("Kraj pochodzenia", "SELECT", "Kraje", False, None),
  ("Kraj urodzenia", "TEXT_FIELD", "Kraje", False, "SELECT"),       # not the applicant's: a country list, not PESEL
  ("Obywatelstwo", "TEXT_FIELD", "Kraje", False, "SELECT"),
  ("Województwo, powiat, gmina, miejscowość", "SELECT", "TERYT_4G_DOWODOWY", True, None),
  ("Gmina", "SELECT", "TERYT_4G_DOWODOWY", True, None),
])
def test_dictionaries(label, field_type, dictionary, tree, new_type):
  enrichment = enrich_field(label, field_type, False, False)
  assert enrichment.dictionary_name == dictionary and enrichment.multi_level_tree is tree
  assert enrichment.search_enabled, "Standardy: search on for Kraje and TERYT_4G_DOWODOWY"
  assert enrichment.field_type == new_type


@pytest.mark.parametrize("label,field_type", [
  ("Kraj", "RADIO"),                    # Słowniki: Kraje only on a dropdown
  ("Kraj", "CHECKBOX"),
  ("Gmina", "TEXT_FIELD"),              # an address part typed as text stays text
  ("Nazwa organu państwa", "TEXT_FIELD"),
  ("Kraj, województwo", "SELECT"),      # two dictionaries fit
  ("Rodzaj pojazdu", "SELECT"),
])
def test_no_dictionary(label, field_type):
  enrichment = enrich_field(label, field_type, False, False)
  assert enrichment.dictionary_name is None and enrichment.field_type is None


# --- proposed dictionaries --------------------------------------------------------------------------------------------

VEHICLES = ["Samochód osobowy", "Samochód ciężarowy", "Motocykl", "Ciągnik rolniczy", "Przyczepa", "Autobus"]


def spec_with(*fields: FieldSpec) -> FormSpec:
  return FormSpec(title="Wniosek o test", pages=[PageSpec(title="P", sections=[SectionSpec(key="s", title="S", fields=list(fields))])])


def choice(key: str, label: str, options: list[str], type_: str = "SELECT") -> FieldSpec:
  return FieldSpec(key=key, label=label, type=type_, required=False, options=options)


def test_long_option_list_is_proposed():
  [proposal] = proposed_dictionaries(spec_with(choice("rodzaj_pojazdu", "Rodzaj pojazdu", VEHICLES)))
  assert proposal.name == "RODZAJ_POJAZDU" and proposal.values_example == VEHICLES
  assert proposal.used_by == ["Rodzaj pojazdu"]


def test_shared_option_list_is_proposed_once():
  titles = ["Własność", "Współwłasność", "Najem"]
  spec = spec_with(choice("a", "Tytuł prawny do lokalu", titles, "RADIO"), choice("b", "Tytuł prawny do garażu", titles, "RADIO"))
  [proposal] = proposed_dictionaries(spec)
  assert proposal.name == "TYTUL_PRAWNY_DO_LOKALU"
  assert proposal.used_by == ["Tytuł prawny do lokalu", "Tytuł prawny do garażu"]


def test_names_are_unique():
  other = [v + " (inny)" for v in VEHICLES]
  names = [p.name for p in proposed_dictionaries(spec_with(choice("a", "Rodzaj pojazdu", VEHICLES), choice("b", "Rodzaj pojazdu", other)))]
  assert names == ["RODZAJ_POJAZDU", "RODZAJ_POJAZDU_2"]


def test_no_proposals_for_short_trivial_predefined_or_long_values():
  countries = ["Polska", "Niemcy", "Czechy", "Słowacja", "Litwa", "Ukraina"]
  sentences = [f"Oświadczam, że zapoznałem się z treścią punktu {n} pouczenia dołączonego do wniosku." for n in range(6)]
  spec = spec_with(
    choice("a", "Wybierz", ["A", "B", "C"], "RADIO"),                              # short and used once
    choice("b", "Czy dotyczy", ["Tak", "Nie", "Nie dotyczy"], "RADIO"),
    choice("c", "Czy dotyczy także", ["Tak", "Nie", "Nie dotyczy"], "RADIO"),      # shared, but trivial
    choice("d", "Kraj", countries),                                               # Kraje already exists
    choice("e", "Oświadczenia", sentences, "CHECKBOX"),                           # sentences, not entries
    FieldSpec(key="f", label="Uwagi", type="TEXTAREA", required=False),
  )
  assert proposed_dictionaries(spec) == []


# --- with the real builder (block D) ----------------------------------------------------------------------------------

def form_fields(form: dict):
  for tab in form["tabs"]:
    for question in tab["questions"]:
      yield question["field"]
      for child in question["field"].get("repeatingSectionGrid") or []:
        yield child["field"]


def test_builder_applies_enrichment():
  spec = spec_with(
    FieldSpec(key="data_urodzenia", label="Data urodzenia", type="TEXT_FIELD", required=True, applicant_data=True),
    FieldSpec(key="kraj_urodzenia_dziecka", label="Kraj urodzenia dziecka", type="TEXT_FIELD", required=True),
    FieldSpec(key="nip_wspolnika", label="NIP wspólnika", type="TEXT_FIELD", required=False),
  )
  form = build_form(spec, Settings(_env_file=None, llm_api_key="k", llm_model="m"))
  fields = {f["title"]: f for f in form_fields(form)}
  birth = fields["Data urodzenia"]
  assert birth["type"] == "DATEPICKER" and birth["defaultValue"] == "PESEL.birthDate"
  assert birth["defaultValueType"] == "EXTERNAL_SYSTEM" and birth["readOnly"] is True
  country = fields["Kraj urodzenia dziecka"]
  assert country["type"] == "SELECT" and country["dictionaryName"] == "Kraje" and country["options"] == []
  assert country["searchEnabled"] is True and country["readOnly"] is False
  assert fields["NIP wspólnika"]["validation"] == ["NIP"]
