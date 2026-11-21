"""Predefined sections from "HackNation - Standardy i dobre praktyki projektowania formularzy", driven by FormSpec flags.

Source of truth: the specification documents in `dane_zadania/materialy/` (Standardy, Reguły techniczne, Dane
inicjalne, Słowniki). The reference JSONs are not followed where they differ. Generic for every form: only
`spec.title`, `spec.authority_*`, the flags and `spec.consents` are used.

Every standard field is configured explicitly (validators, initial data), without block E's label matching.
"""

import unicodedata
from functools import partial
from typing import Protocol

from hacknation_2026.builder import jsonata
from hacknation_2026.builder.layout import html_text, section, slug
from hacknation_2026.contracts import FormSpec

DATA_PAGE = "Dane"
CONTACT_PAGE = "Kontakt i zgody"
FINISH_PAGE = "Strona końcowa"

POLAND = "Polska"
COUNTRIES = "Kraje"
TERYT = "TERYT_4G_DOWODOWY"
TERYT_LABEL = "Województwo, powiat, gmina, miejscowość"

SELF = "Swoim"
OTHER_PERSON = "Innej osoby"
LEGAL_ENTITY = "Osoby prawnej lub jednostki organizacyjnej"
PROXY = "Pełnomocnik"
REPRESENTATIVE = "Reprezentant"
YES, NO = "Tak", "Nie"

# texts quoted from Standardy
DEFAULT_CONSENT = "Wyrażam zgodę na przetwarzanie moich danych osobowych zgodnie z klauzulą informacyjną."
PREVIEW_TEXT = "Zanim przejdziesz do wyboru sposobu podpisu, sprawdź dane na podglądzie. Jeśli zobaczysz błędy, wróć do edycji."
PROXY_DESCRIPTION = "Dodaj dokument potwierdzający, że jesteś pełnomocnikiem."
STAMP_DUTY_DESCRIPTION = (
  "Nie musisz płacić za złożenie pełnomocnictwa wystawionego przez najbliższą rodzinę: małżonka, dzieci, rodziców, "
  "dziadków, wnuków, rodzeństwo.\nWięcej informacji na stronie biznes.gov.pl"
)
STAMP_DUTY_TEXT = (
  "Opłata skarbowa wynosi 17 zł.\n"
  "Przelej ją na konto urzędu miasta lub gminy właściwego dla adresu zamieszkania osoby, która udzieliła "
  "pełnomocnictwa. Jeśli adres nie jest w Polsce, opłatę przelej na konto Urzędu Miasta Stołecznego Warszawy – "
  "Centrum Obsługi Podatnika\n"
  "W tytule przelewu wpisz „{title} – opłata skarbowa za pełnomocnictwo”.\n"
  "Dodaj plik z potwierdzeniem przelewu. Znajdziesz go na stronie lub w aplikacji swojego banku."
)
# "Możesz je zmienić lub usunąć." from Standardy is left out: initial data fields are read-only (Dane inicjalne).
CONTACT_DESCRIPTION = (
  "Wpisanie danych do kontaktu może przyspieszyć załatwienie sprawy. Urzędnik będzie mógł skontaktować się z Tobą "
  "w przypadku pytań lub wątpliwości.\nJeśli widzisz uzupełnione dane, sprawdź, czy są poprawne."
)

# document kind (first word of the title) -> (verb "wnioskujesz", participle "składany")
_DOCUMENT_FORMS = {
  "wniosek": ("wnioskujesz", "składany"),
  "zgłoszenie": ("zgłaszasz", "składane"),
  "deklaracja": ("deklarujesz", "składana"),
  "oświadczenie": ("oświadczasz", "składane"),
}


class MakeField(Protocol):
  """Field factory from build.py (applies the technical rules, e.g. initial data => read-only)."""

  def __call__(
    self, type_: str, tech_name: str, title: str, *, required: bool = False, validators: list[str] | None = None,
    initial: str | None = None, enrich: bool = True, **kw,
  ) -> dict: ...


def _document(spec: FormSpec) -> tuple[str, str, str]:
  """(noun, verb, participle) of the document kind named by the first word of the title."""
  noun = (spec.title.split() or ["wniosek"])[0].lower()
  if noun not in _DOCUMENT_FORMS:
    noun = "wniosek"
  return noun, *_DOCUMENT_FORMS[noun]


def _labels(spec: FormSpec) -> tuple[str, str]:
  verb = _document(spec)[1]
  return f"Wybierz, w czyim imieniu {verb}", f"Wybierz, jako kto {verb}"


def _answer(section_tech_name: str, field_tech_name: str, value: str) -> str:
  return jsonata.equals(value, jsonata.answer_path(DATA_PAGE, section_tech_name, field_tech_name))


class _Subject:
  """Conditions on the "Podmiot wniosku" answers."""

  def __init__(self, spec: FormSpec):
    whose, role = _labels(spec)
    self.whose, self.role = slug(whose), slug(role)

  def is_(self, value: str) -> str:
    return _answer("podmiot_wniosku", self.whose, value)

  def role_is(self, value: str) -> str:
    return _answer("podmiot_wniosku", self.role, value)


def _flags(spec: FormSpec) -> tuple[bool, bool]:
  """(other person, legal entity). A proxy always acts for someone else, so allows_proxy enables "other person"."""
  return spec.allows_other_person or spec.allows_proxy, spec.allows_legal_entity


def _standard(make: MakeField) -> MakeField:
  return partial(make, enrich=False)


# --- address (Standardy: "Adres") -------------------------------------------------------------------------------------

def address_section(make: MakeField, tech_name: str, title: str, suffix: str, applicant: bool, states: list[dict]) -> dict:
  """Country; abroad: town, postcode, street; Poland: one TERYT field, postcode, street; building and flat for both.

  Fields that Standardy give a "Brak ..." checkbox (street, foreign postcode, flat) are optional, because the JSON
  contract cannot express that checkbox. Initial data (MLPZ) only for the applicant's own address.
  """
  make = _standard(make)
  country = f"kraj{suffix}"
  in_poland = _answer(tech_name, country, POLAND)
  polish, foreign = jsonata.show(in_poland), jsonata.show(jsonata.not_(in_poland))

  def text(base: str, label: str, *, abroad: bool = False, initial: str | None = None, **kw) -> dict:
    name = f"{base}{suffix}{'_zagranica' if abroad else ''}"
    return make("TEXT_FIELD", name, label, initial=f"MLPZ.{initial}" if applicant and initial else None, **kw)

  fields = [
    make(
      "SELECT", country, "Kraj", required=True,
      dictionaryName=COUNTRIES, searchEnabled=True, defaultValue=[POLAND],
    ),
    text("miejscowosc", "Miejscowość", abroad=True, required=True, states=foreign),
    text("kod_pocztowy", "Kod pocztowy", abroad=True, states=foreign),
    text("ulica", "Ulica", abroad=True, states=foreign),
    make(
      "SELECT", f"wojewodztwo{suffix}", TERYT_LABEL, required=True, states=polish,
      dictionaryName=TERYT, multiLevelTree=True, searchEnabled=True, defaultValue=[],
    ),
    text("kod_pocztowy", "Kod pocztowy", required=True, validators=["ZIP_CODE"], states=polish, initial="postCode"),
    text("ulica", "Ulica", states=polish, initial="street"),
    text("numer_budynku", "Numer budynku", required=True, initial="building"),
    text("numer_lokalu", "Numer lokalu", initial="apartment"),
  ]
  return section(tech_name, title, fields, states=states)


# --- page "Dane" ------------------------------------------------------------------------------------------------------

def authority_section(spec: FormSpec, make: MakeField) -> dict:
  noun, _, submitted = _document(spec)
  if spec.authority_kind == "ORGAN":
    title, label = f"Organ, do którego jest {submitted} {noun}", "Nazwa organu"
  else:
    title, label = f"Urząd, do którego jest {submitted} {noun}", "Nazwa urzędu"
  name = spec.authority_name.strip()
  extra = {"defaultValue": name} if name else {}
  authority = _standard(make)("TEXT_FIELD", slug(label), label, required=not name, read_only=bool(name), **extra)
  return section(slug(title), title, [authority])


def subject_section(spec: FormSpec, make: MakeField) -> dict | None:
  """Skipped when the applicant can only act on their own behalf (Standardy)."""
  other, legal = _flags(spec)
  if not (other or legal):
    return None
  make, subject = _standard(make), _Subject(spec)
  whose, role = _labels(spec)
  subjects = [SELF] + ([OTHER_PERSON] if other else []) + ([LEGAL_ENTITY] if legal else [])
  fields = [make("RADIO", subject.whose, whose, required=True, option_names=subjects)]
  if legal:
    fields.append(make(
      "RADIO", subject.role, role, required=True,
      option_names=[PROXY, REPRESENTATIVE], states=jsonata.show(subject.is_(LEGAL_ENTITY)),
    ))
  return section("podmiot_wniosku", "Podmiot wniosku", fields)


def applicant_sections(make: MakeField) -> list[dict]:
  std = _standard(make)
  you = section("twoje_dane", "Twoje dane", [
    std("TEXT_FIELD", "imie", "Imię", required=True, initial="MLPZ.name"),
    std("TEXT_FIELD", "nazwisko", "Nazwisko", required=True, initial="MLPZ.surname"),
    std("TEXT_FIELD", "numer_pesel", "Numer PESEL", required=True, validators=["PESEL"], initial="MLPZ.pesel"),
  ])
  return [you, address_section(make, "adres_zamieszkania", "Adres zamieszkania", "", applicant=True, states=[])]


def legal_entity_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  std, subject = _standard(make), _Subject(spec)
  legal = jsonata.show(subject.is_(LEGAL_ENTITY))
  entity = section("dane_podmiotu", "Dane podmiotu", [
    std("TEXT_FIELD", "nazwa", "Nazwa", required=True),
    std("TEXT_FIELD", "nip", "NIP", required=True, validators=["NIP"]),
    std("TEXT_FIELD", "regon", "REGON", required=True, validators=["REGON"]),
    std("TEXT_FIELD", "numer_krs", "Numer KRS"),  # Standardy: Pattern ^\d{10}$, not among the allowed validators
  ], states=legal)
  seat = address_section(make, "adres_siedziby", "Adres siedziby", "_siedziba", applicant=False, states=legal)
  # Extension (not described in Standardy): a representative proves the right to represent the entity.
  representative = section(
    "potwierdzenie_ze_jestes_reprezentantem", "Potwierdzenie, że jesteś reprezentantem",
    [std("FILE_UPLOADER", "plik_z_odpisem_danych", "Plik z odpisem danych", required=True)],
    states=jsonata.show(jsonata.and_(subject.is_(LEGAL_ENTITY), subject.role_is(REPRESENTATIVE))),
  )
  return [entity, seat, representative]


def other_person_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  std, subject = _standard(make), _Subject(spec)
  other = jsonata.show(subject.is_(OTHER_PERSON))
  person = section("dane_innej_osoby", "Dane innej osoby", [
    std("TEXT_FIELD", "imie_inna_osoba", "Imię", required=True),
    std("TEXT_FIELD", "nazwisko_inna_osoba", "Nazwisko", required=True),
    std("TEXT_FIELD", "numer_pesel_inna_osoba", "Numer PESEL", required=True, validators=["PESEL"]),
  ], states=other)
  address = address_section(
    make, "adres_zamieszkania_osoby_ktorej_jestes_pelnomocnikiem", "Adres zamieszkania innej osoby",
    "_inna_osoba", applicant=False, states=other,
  )
  return [person, address]


def proxy_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  other, legal = _flags(spec)
  if not (other or legal):
    return []
  std, subject = _standard(make), _Subject(spec)
  legal_proxy = jsonata.and_(subject.is_(LEGAL_ENTITY), subject.role_is(PROXY))
  needs_proxy = jsonata.or_(
    subject.is_(OTHER_PERSON) if other else "",
    jsonata.group(legal_proxy) if legal and other else legal_proxy if legal else "",
  )
  duty_text = html_text(STAMP_DUTY_TEXT.format(title=spec.title))
  sections = [section(
    "pelnomocnictwo", "Pełnomocnictwo",
    [std("FILE_UPLOADER", "plik_dokumentu_z_pelnomocnictwem", "Plik dokumentu z pełnomocnictwem", required=True)],
    states=jsonata.show(needs_proxy), description=PROXY_DESCRIPTION,
  )]
  if other:  # Standardy: "Opłata skarbowa (wersja 1)"
    duty_due = jsonata.show(_answer("oplata_skarbowa_pelnomocnictwo_1", "czy_zlozenie_pelnomocnictwa_wymaga_oplaty_skarbowej", YES))
    sections.append(section("oplata_skarbowa_pelnomocnictwo_1", "Opłata skarbowa", [
      std(
        "RADIO", "czy_zlozenie_pelnomocnictwa_wymaga_oplaty_skarbowej", "Czy złożenie pełnomocnictwa wymaga opłaty skarbowej?",
        required=True, option_names=[YES, NO],
      ),
      std("TEXT_BLOCK", "oplata_info_1", "", description=duty_text, states=duty_due),
      std("FILE_UPLOADER", "plik_z_potwierdzeniem_przelewu", "Plik z potwierdzeniem przelewu", required=True, states=duty_due),
    ], states=jsonata.show(subject.is_(OTHER_PERSON)), description=STAMP_DUTY_DESCRIPTION))
  if legal:  # Standardy: "Opłata skarbowa (wersja 2)"
    sections.append(section("oplata_skarbowa_pelnomocnictwo_2", "Opłata skarbowa", [
      std("TEXT_BLOCK", "oplata_info", "", description=duty_text),
      std("FILE_UPLOADER", "plik_z_potwierdzeniem_przelewu_2", "Plik z potwierdzeniem przelewu", required=True),
    ], states=jsonata.show(legal_proxy)))
  return sections


def data_page_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  """First page: addressee, then the parties (Standardy: "logiczna kolejność zbierania danych")."""
  other, legal = _flags(spec)
  sections = [authority_section(spec, make)]
  subject = subject_section(spec, make)
  if subject:
    sections.append(subject)
  sections += applicant_sections(make)
  if legal:
    sections += legal_entity_sections(spec, make)
  if other:
    sections += other_person_sections(spec, make)
  sections += proxy_sections(spec, make)
  return sections


# --- penultimate page: contact and consents ---------------------------------------------------------------------------

def _plain(text: str) -> str:
  return unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()


def consent_title(statements: list[str]) -> str:
  """Standardy: "Oświadczenie" when only statements, "Zgody i oświadczenia" when mixed, otherwise "Zgoda"."""
  is_statement = ["oswiadcz" in _plain(text) for text in statements]
  if all(is_statement):
    return "Oświadczenie"
  if any(is_statement):
    return "Zgody i oświadczenia"
  return "Zgoda"


def contact_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  std = _standard(make)
  contact = section("dane_do_kontaktu", "Dane do kontaktu", [
    std("TEXT_FIELD", "numer_telefonu", "Numer telefonu", initial="MLPZ.phoneNumber"),
    std("TEXT_FIELD", "adres_e_mail", "Adres e-mail", validators=["EMAIL"], initial="MLPZ.email"),
  ], description=CONTACT_DESCRIPTION)
  statements = [c.strip() for c in spec.consents if c.strip()] or [DEFAULT_CONSENT]
  consents = [{"description": html_text(text), "required": True} for text in statements]
  config = {"consents": consents, "required": any(c["required"] for c in consents), "files": []}
  if len(consents) > 1:
    config["selectAllEnabled"] = True
  title = consent_title(statements)
  consent = std("CONSENT_SECTION", "sekcja_zgod", "", consentSectionConfig=config)
  return [contact, section(slug(title), title, [consent])]


# --- finish page ------------------------------------------------------------------------------------------------------

def finish_sections(spec: FormSpec, make: MakeField) -> list[dict]:
  """Reguły techniczne: only INFO_SECTION on the FINISH page; content from Standardy ("Podgląd")."""
  preview = _standard(make)("INFO_SECTION", "podglad_info", "", description=html_text(PREVIEW_TEXT))
  return [section("podglad", "Podgląd", [preview])]
