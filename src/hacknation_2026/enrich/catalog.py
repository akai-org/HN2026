"""Block E data, copied from the documents in `dane_zadania/materialy/`. No logic here (see enrich.py).

- Initial data (sources, attributes, Polish names, field types): "Dane inicjalne".
- Which applicant field takes which attribute: Standardy ("Twoje dane", address and contact take MLPZ);
  attributes only the PESEL register has come from PESEL, the registered address (zameldowanie) from PESEL_ADDRESS.
- Dictionaries: "Słowniki" (Kraje and the address dictionaries, only on a dropdown) and Standardy (technical name
  TERYT_4G_DOWODOWY, search on; województwo, powiat, gmina and miejscowość chosen one after another, so a tree).
- Validators: the allowed list from Reguły techniczne; which label gets which validator from Standardy.

Phrases are normalized like labels (enrich.normalize): lower case, no Polish letters, words split by single spaces.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Attribute:
  source: str                     # PESEL, PESEL_ADDRESS or MLPZ
  name: str                       # e.g. "birthDate"
  title: str                      # Polish name from "Dane inicjalne"
  field_type: str = "TEXT_FIELD"  # "Typ pola" from "Dane inicjalne"

  @property
  def value(self) -> str:
    """`defaultValue` of a field fed with this attribute, e.g. "PESEL.birthDate"."""
    return f"{self.source}.{self.name}"


@dataclass(frozen=True)
class Rule:
  value: str                      # validator, dictionary name or attribute value ("MLPZ.email")
  phrases: tuple[str, ...]        # one of them must occur in the label as whole words
  requires: tuple[str, ...] = ()  # if given, one of these words must occur as well
  forbids: tuple[str, ...] = ()   # none of these words may occur


@dataclass(frozen=True)
class Dictionary(Rule):
  multi_level_tree: bool = False
  search_enabled: bool = True                 # Standardy: search on for both predefined dictionaries
  text_field_prefixes: tuple[str, ...] = ()   # a TEXT_FIELD whose label starts with one of these becomes a SELECT


# --- initial data ("Dane inicjalne") ------------------------------------------------------------------------------------

SOURCES = {
  "PESEL": "Rejestr PESEL",
  "PESEL_ADDRESS": "Dane zameldowania",
  "MLPZ": "Dane zalogowanego użytkownika",
}

_ATTRIBUTES = (
  # Rejestr PESEL
  Attribute("PESEL", "pesel", "Pesel z PESEL"),
  Attribute("PESEL", "name", "Imię z PESEL"),
  Attribute("PESEL", "surname", "Nazwisko z PESEL"),
  Attribute("PESEL", "birthDate", "Data urodzenia z PESEL", "DATEPICKER"),
  Attribute("PESEL", "citizenship", "Narodowość z PESEL"),
  Attribute("PESEL", "motherName", "Imię matki z PESEL"),
  Attribute("PESEL", "birthPlace", "Miejsce urodzenia z PESEL"),
  Attribute("PESEL", "motherSurname", "Nazwisko matki z PESEL"),
  Attribute("PESEL", "sex", "Płeć z PESEL"),
  Attribute("PESEL", "fatherName", "Imię ojca z PESEL"),
  Attribute("PESEL", "secondName", "Drugie imię z PESEL"),
  Attribute("PESEL", "birthCountry", "Kraj urodzenia z PESEL"),
  Attribute("PESEL", "foreignBirthUSC", "Zagraniczne miasto USC urodzenia z PESEL"),
  Attribute("PESEL", "familyName", "Nazwisko rodowe z PESEL"),
  Attribute("PESEL", "fatherSurname", "Nazwisko ojca z PESEL"),
  Attribute("PESEL", "maritalStatus", "Stan cywilny z PESEL"),
  # Dane zameldowania
  Attribute("PESEL_ADDRESS", "temporaryAddressVoivodeship", "Tymczasowy adres zameldowania: województwo z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressDistrict", "Tymczasowy adres zameldowania: region z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressCommunity", "Tymczasowy adres zameldowania: gmina z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressPlace", "Tymczasowy adres zameldowania: Miejscowość z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressStreetType", "Tymczasowy adres zameldowania: Typ ulicy z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressStreet", "Tymczasowy adres zameldowania: Ulica z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressHouseNumber", "Tymczasowy adres zameldowania: Numer domu z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressApartmentNumber", "Tymczasowy adres zameldowania: Numer lokalu z PESEL"),
  Attribute("PESEL_ADDRESS", "temporaryAddressPostalCode", "Tymczasowy adres zameldowania: Kod pocztowy z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressVoivodeship", "Stały adres zameldowania: województwo z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressDistrict", "Stały adres zameldowania: region z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressCommunity", "Stały adres zameldowania: gmina z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressPlace", "Stały adres zameldowania: Miejscowość z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressStreetType", "Stały adres zameldowania: Typ ulicy z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressStreet", "Stały adres zameldowania: Ulica z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressPostalCode", "Stały adres zameldowania: Kod pocztowy z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressHouseNumber", "Stały adres zameldowania: Numer domu z PESEL"),
  Attribute("PESEL_ADDRESS", "permanentAddressApartmentNumber", "Stały adres zameldowania: Numer lokalu z PESEL"),
  # Dane zalogowanego użytkownika
  Attribute("MLPZ", "name", "Imię z MLPZ"),
  Attribute("MLPZ", "secondName", "Drugie Imię z MLPZ"),
  Attribute("MLPZ", "surname", "Nazwisko z MLPZ"),
  Attribute("MLPZ", "pesel", "Wartość PESEL z MLPZ"),
  Attribute("MLPZ", "phoneNumber", "Numer telefonu z MLPZ"),
  Attribute("MLPZ", "email", "Adres email z MLPZ"),
  Attribute("MLPZ", "country", "Kraj z MLPZ"),
  Attribute("MLPZ", "voivodeship", "Województwo z MLPZ"),
  Attribute("MLPZ", "district", "Dzielnica z MLPZ"),
  Attribute("MLPZ", "community", "Gmina z MLPZ"),
  Attribute("MLPZ", "place", "Miejscowość z MLPZ"),
  Attribute("MLPZ", "postCode", "Kod pocztowy z MLPZ"),
  Attribute("MLPZ", "street", "Ulica z MLPZ"),
  Attribute("MLPZ", "building", "Nr budynku z MLPZ"),
  Attribute("MLPZ", "apartment", "Nr lokalu z MLPZ"),
  Attribute("MLPZ", "institutionName", "Nazwa Organizacji z MLPZ"),
  Attribute("MLPZ", "descriptiveOrganizationName", "Opisowa nazwa organizacji z MLPZ"),
)
ATTRIBUTES = {attribute.value: attribute for attribute in _ATTRIBUTES}

_HOUSE = ("numer budynku", "nr budynku", "numer domu", "nr domu")
_APARTMENT = ("numer lokalu", "nr lokalu", "numer mieszkania", "nr mieszkania")
_EMAIL = ("e mail", "email", "poczty elektronicznej", "poczta elektroniczna")

# The applicant's own data. Standardy feed name, PESEL, address and contact from MLPZ, so MLPZ wins where both
# sources have the attribute; the rest exists only in the PESEL register.
INITIAL_DATA_RULES = (
  Rule("MLPZ.name", ("imie",)),
  Rule("MLPZ.secondName", ("drugie imie",)),
  Rule("MLPZ.surname", ("nazwisko",)),
  Rule("MLPZ.pesel", ("pesel",)),
  Rule("MLPZ.phoneNumber", ("telefon", "telefonu", "tel")),
  Rule("MLPZ.email", _EMAIL),
  Rule("MLPZ.country", ("kraj",)),
  Rule("MLPZ.voivodeship", ("wojewodztwo",)),
  Rule("MLPZ.district", ("dzielnica",)),
  Rule("MLPZ.community", ("gmina",)),
  Rule("MLPZ.place", ("miejscowosc",)),
  Rule("MLPZ.postCode", ("kod pocztowy",)),
  Rule("MLPZ.street", ("ulica", "ulicy"), forbids=("typ", "rodzaj")),
  Rule("MLPZ.building", _HOUSE),
  Rule("MLPZ.apartment", _APARTMENT),
  Rule("MLPZ.institutionName", ("nazwa organizacji", "nazwa instytucji")),
  Rule("MLPZ.descriptiveOrganizationName", ("opisowa nazwa organizacji",)),
  Rule("PESEL.birthDate", ("data urodzenia",)),
  Rule("PESEL.citizenship", ("obywatelstwo", "narodowosc")),
  Rule("PESEL.motherName", ("imie matki",)),
  Rule("PESEL.birthPlace", ("miejsce urodzenia", "miejscowosc urodzenia")),
  Rule("PESEL.motherSurname", ("nazwisko matki",)),
  Rule("PESEL.sex", ("plec",)),
  Rule("PESEL.fatherName", ("imie ojca",)),
  Rule("PESEL.birthCountry", ("kraj urodzenia", "panstwo urodzenia")),
  Rule("PESEL.foreignBirthUSC", ("usc urodzenia", "miasto usc")),
  Rule("PESEL.familyName", ("nazwisko rodowe",)),
  Rule("PESEL.fatherSurname", ("nazwisko ojca",)),
  Rule("PESEL.maritalStatus", ("stan cywilny",)),
)

# The registered address ("adres zameldowania") comes from PESEL_ADDRESS: value = attribute name after the prefix.
REGISTERED_ADDRESS_WORDS = ("zameldowania", "zameldowanie", "zameldowany", "zameldowana", "meldunku", "meldunkowy")
TEMPORARY_WORDS = (
  "tymczasowy", "tymczasowego", "tymczasowym", "tymczasowa", "tymczasowe",
  "czasowy", "czasowego", "czasowym", "czasowa", "czasowe",
)
TEMPORARY_PREFIX, PERMANENT_PREFIX = "PESEL_ADDRESS.temporaryAddress", "PESEL_ADDRESS.permanentAddress"
REGISTERED_ADDRESS_RULES = (
  Rule("Voivodeship", ("wojewodztwo",)),
  Rule("District", ("powiat", "region")),
  Rule("Community", ("gmina",)),
  Rule("Place", ("miejscowosc",)),
  Rule("StreetType", ("typ ulicy", "rodzaj ulicy")),
  Rule("Street", ("ulica", "ulicy")),
  Rule("HouseNumber", _HOUSE),
  Rule("ApartmentNumber", _APARTMENT),
  Rule("PostalCode", ("kod pocztowy",)),
)

# Another person's data never takes the applicant's initial data ("PESEL małżonka", "Nazwisko rodowe matki").
# Words that are part of a matched phrase do not count, so "Imię matki" still means the applicant's mother.
OTHER_PERSON_WORDS = (
  "malzonka", "malzonki", "wspolmalzonka", "wspolmalzonki", "partnera", "partnerki",
  "matki", "ojca", "rodzica", "rodzicow", "dziecka", "dzieci", "syna", "corki", "brata", "siostry", "wnuka", "wnuczki",
  "pelnomocnika", "opiekuna", "kuratora", "przedstawiciela", "reprezentanta", "czlonka", "osoby",
  "zmarlego", "zmarlej", "spadkodawcy", "wlasciciela", "wspolwlasciciela", "najemcy", "dzierzawcy",
  "zbywcy", "nabywcy", "swiadka", "pracownika", "pracodawcy", "wierzyciela", "dluznika", "poszkodowanego", "sprawcy",
)
# A field holding several values ("Imię i nazwisko", "Numer budynku i lokalu") cannot take a single attribute.
JOINING_WORDS = ("i", "oraz", "lub", "albo")

# --- dictionaries ("Słowniki", Standardy) ------------------------------------------------------------------------------

# Słowniki: Kraje and the address dictionaries may be attached only to a dropdown.
DICTIONARY_FIELD_TYPE = "SELECT"
DICTIONARIES = (
  Dictionary(
    "Kraje", ("kraj", "kraju", "kraje", "panstwo", "panstwa", "obywatelstwo", "obywatelstwa"),
    text_field_prefixes=("kraj", "panstwo", "obywatelstwo", "nazwa kraju", "nazwa panstwa"),
  ),
  Dictionary(
    "TERYT_4G_DOWODOWY",
    ("wojewodztwo", "wojewodztwa", "powiat", "powiatu", "gmina", "gminy", "miejscowosc", "miejscowosci"),
    multi_level_tree=True,
  ),
)

# --- validators (Reguły techniczne, Standardy) -------------------------------------------------------------------------

VALIDATORS = ("REQUIRED", "EMAIL", "PESEL", "NIP", "REGON", "ZIP_CODE", "EPUAP", "ADE", "SERIAL_NUMBER_ID_CARD")
# Format validators check typed text, so they go only on these types.
TEXT_INPUT_TYPES = frozenset({"TEXT_FIELD", "NUMBER"})
# Standardy: a postal code outside Poland has no validation.
FOREIGN_WORDS = (
  "zagraniczny", "zagranicznego", "zagranicznym", "zagraniczna", "zagranicznej", "zagranica", "zagranicy",
  "poza", "spoza",
)
VALIDATOR_RULES = (
  Rule("PESEL", ("pesel",)),
  Rule("NIP", ("nip",)),
  Rule("REGON", ("regon",)),
  Rule("EMAIL", _EMAIL),
  Rule("ZIP_CODE", ("kod pocztowy", "kodu pocztowego"), forbids=FOREIGN_WORDS),
  Rule("EPUAP", ("epuap",)),
  Rule("ADE", ("ade", "doreczen elektronicznych")),
  Rule("SERIAL_NUMBER_ID_CARD", ("dowodu osobistego", "dowod osobisty"), requires=("numer", "nr", "seria", "serii")),
)
# A label offering alternatives ("NIP lub PESEL") fits no single format.
ALTERNATIVE_WORDS = ("lub", "albo")
