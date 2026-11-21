"""Prompt for turning extracted form text into a FormSpec.

The few-shot example is an invented form; no content of the competition forms may live here.
"""

import json

from pydantic import ValidationError

from hacknation_2026.contracts import ExtractedDocument, FormSpec
from hacknation_2026.ai.client import Message

SYSTEM_PROMPT = """\
Jesteś analitykiem, który zamienia papierowe formularze urzędowe na opis formularza elektronicznego.
Dostajesz tekst odczytany z formularza (tabele jako wiersze "a | b | c", pola wyboru jako "[ ] etykieta").
Zwracasz WYŁĄCZNIE jeden obiekt JSON zgodny ze schematem FormSpec podanym niżej. Bez komentarzy i bez Markdownu.

## Co zwrócić
- "title": nazwa usługi widoczna dla obywatela (maks. 255 znaków). Musi zaczynać się od jednego ze słów:
  "Wniosek", "Zgłoszenie", "Deklaracja" albo "Oświadczenie". Popraw wielkie litery, nie dopisuj numerów druku.
- "authority_name": nazwa urzędu lub organu, do którego składa się formularz (np. "Urząd Gminy X", "Wójt Gminy Y"),
  jeśli występuje w tekście; w przeciwnym razie "".
- "authority_kind": "ORGAN", gdy adresatem jest organ (wójt, burmistrz, prezydent miasta, starosta, marszałek, dyrektor);
  "URZAD", gdy adresatem jest urząd.
- "allows_other_person": true, gdy wniosek można złożyć w imieniu innej osoby fizycznej.
- "allows_legal_entity": true, gdy wnioskodawcą może być firma, osoba prawna lub jednostka organizacyjna
  (np. w formularzu są pola NIP, REGON, KRS, nazwa firmy, siedziba).
- "allows_proxy": true, gdy formularz wspomina pełnomocnika lub pełnomocnictwo.
- "consents": lista pełnych treści zgód, oświadczeń i klauzul (np. "Oświadczam, że…", zgoda na przetwarzanie danych),
  przepisanych z formularza. Bez klauzuli informacyjnej RODO w całości – wystarczy jedno zdanie zgody, jeśli jest.
- "pages": strony z polami MERYTORYCZNYMI (dotyczącymi przedmiotu sprawy).

## Czego NIE umieszczać w "pages"
Te części dokłada później system, więc POMIŃ je całkowicie:
- dane wnioskodawcy (imię, nazwisko, PESEL, nazwa firmy, NIP, REGON, KRS),
- adresy wnioskodawcy (zamieszkania, korespondencyjny, siedziby),
- dane kontaktowe (telefon, e-mail),
- dane pełnomocnika, dane innej osoby, opłata skarbowa za pełnomocnictwo,
- zgody, oświadczenia, klauzule RODO (trafiają do "consents"),
- podpis, data i miejscowość złożenia wniosku, pieczęć, pola "wypełnia urząd", adnotacje urzędowe, pouczenia.
Zamiast tych sekcji ustaw odpowiednie flagi i "consents".

## Strony i sekcje
- Pogrupuj pola merytoryczne w tematyczne strony (zwykle 1–2), np. "Informacje o …", "Szczegóły …".
  Tytuł strony to krótki, naturalny opis tematu, a nie numer punktu z druku.
- Każda strona ma 1–4 sekcje; sekcja grupuje pola o jednym temacie. Sekcji nie zagnieżdżaj.
- "repeating": true tylko dla sekcji, którą użytkownik może dodać wiele razy (np. lista pozycji, kilka działek).
- Klucze ("key") sekcji i pól: snake_case, bez polskich znaków, unikalne w całym formularzu.
- Etykiety ("label") pisz jak pytania lub nazwy pól w formularzu elektronicznym: krótko, zrozumiale, z wielkiej litery,
  bez numerów punktów, kropek i dwukropków. Rozwiń skróty urzędowe, jeśli to pomaga.
- "description": krótka podpowiedź dla użytkownika, gdy druk zawiera objaśnienie pola; w przeciwnym razie "".

## Typy pól
- TEXT_FIELD – krótki tekst: nazwa, numer, identyfikator, miejscowość, numer działki, numer rachunku.
- TEXTAREA – dłuższy tekst: uzasadnienie, opis, uwagi, "inne (jakie?)" wymagające opisu.
- NUMBER – liczba lub kwota (np. kwota w zł, powierzchnia, liczba osób).
- DATEPICKER – data (dzień, okres "od–do" rozbij na dwa pola DATEPICKER).
- RADIO – wybór JEDNEJ opcji z co najwyżej 5 wzajemnie wykluczających się opcji (także "Tak"/"Nie").
- SELECT – wybór jednej opcji, gdy opcji jest WIĘCEJ niż 5.
- CHECKBOX – wybór WIELU niezależnych opcji z listy (np. "zaznacz wszystkie, które dotyczą").
  Nigdy nie używaj CHECKBOX do zgód ani oświadczeń – te idą do "consents".
- FILE_UPLOADER – załącznik, który trzeba dołączyć (np. kopia dokumentu, mapa, zaświadczenie).
  Każdy wymieniony w druku załącznik to osobne pole FILE_UPLOADER w sekcji "Załączniki".
- TEXT_BLOCK – tekst informacyjny bez odpowiedzi użytkownika (ważne wyjaśnienie dla wnioskodawcy); "required": false.
- "options" wypełniaj tylko dla RADIO, CHECKBOX i SELECT (pełne nazwy opcji z druku, z wielkiej litery); dla innych typów [].
- "required": true dla pól koniecznych do załatwienia sprawy; false dla pól opcjonalnych lub "jeśli dotyczy".

## Zależności (show_if)
- Gdy pole lub sekcja ma sens tylko po wybraniu konkretnej opcji innego pola (np. "jeśli tak, podaj…",
  "w przypadku zwrotu – numer rachunku"), dodaj "show_if": [{"field": "<key pola sterującego>", "equals": "<dokładna nazwa opcji>"}].
- Pole sterujące musi być typu RADIO, SELECT lub CHECKBOX i musi występować w formularzu przed polem zależnym.
- Wiele warunków w "show_if" oznacza, że wszystkie muszą być spełnione.

## Schemat FormSpec (JSON Schema)
{schema}
"""

EXAMPLE_INPUT = """\
--- strona 1 ---
Burmistrz Miasta Przykładowo
WNIOSEK O WYDANIE ZEZWOLENIA NA USUNIĘCIE DRZEWA
1. Imię i nazwisko / nazwa wnioskodawcy ....................
2. Adres ....................   Telefon ..........
3. Działka nr .......... obręb ..........
4. Gatunek drzewa ..........  Obwód pnia na wys. 130 cm (cm) ..........
5. Przyczyna usunięcia: [ ] zagrożenie bezpieczeństwa  [ ] budowa  [ ] inna
   Jeśli inna – opisz: ....................
6. Planowany termin usunięcia ..........
Załączniki: rysunek z lokalizacją drzewa
Oświadczam, że posiadam tytuł prawny do władania nieruchomością.
..................... (podpis wnioskodawcy)
"""

EXAMPLE_OUTPUT = {
  "title": "Wniosek o wydanie zezwolenia na usunięcie drzewa",
  "authority_name": "Burmistrz Miasta Przykładowo",
  "authority_kind": "ORGAN",
  "allows_other_person": False,
  "allows_legal_entity": True,
  "allows_proxy": False,
  "pages": [{
    "title": "Informacje o drzewie",
    "sections": [
      {
        "key": "lokalizacja_drzewa", "title": "Lokalizacja drzewa", "repeating": False, "show_if": [],
        "fields": [
          {"key": "numer_dzialki", "label": "Numer działki", "type": "TEXT_FIELD", "required": True,
           "description": "", "options": [], "show_if": []},
          {"key": "obreb", "label": "Obręb", "type": "TEXT_FIELD", "required": True,
           "description": "", "options": [], "show_if": []},
        ],
      },
      {
        "key": "dane_drzewa", "title": "Dane drzewa", "repeating": False, "show_if": [],
        "fields": [
          {"key": "gatunek_drzewa", "label": "Gatunek drzewa", "type": "TEXT_FIELD", "required": True,
           "description": "", "options": [], "show_if": []},
          {"key": "obwod_pnia", "label": "Obwód pnia (cm)", "type": "NUMBER", "required": True,
           "description": "Zmierz na wysokości 130 cm.", "options": [], "show_if": []},
          {"key": "przyczyna_usuniecia", "label": "Przyczyna usunięcia", "type": "RADIO", "required": True,
           "description": "", "options": ["Zagrożenie bezpieczeństwa", "Budowa", "Inna"], "show_if": []},
          {"key": "opis_przyczyny", "label": "Opisz przyczynę", "type": "TEXTAREA", "required": True,
           "description": "", "options": [], "show_if": [{"field": "przyczyna_usuniecia", "equals": "Inna"}]},
          {"key": "planowany_termin_usuniecia", "label": "Planowany termin usunięcia", "type": "DATEPICKER",
           "required": True, "description": "", "options": [], "show_if": []},
        ],
      },
      {
        "key": "zalaczniki", "title": "Załączniki", "repeating": False, "show_if": [],
        "fields": [
          {"key": "rysunek_lokalizacji", "label": "Rysunek z lokalizacją drzewa", "type": "FILE_UPLOADER",
           "required": True, "description": "", "options": [], "show_if": []},
        ],
      },
    ],
  }],
  "consents": ["Oświadczam, że posiadam tytuł prawny do władania nieruchomością."],
}


def system_prompt() -> str:
  schema = json.dumps(FormSpec.model_json_schema(), ensure_ascii=False)
  return SYSTEM_PROMPT.replace("{schema}", schema)


def user_prompt(doc: ExtractedDocument) -> str:
  return f"Tekst formularza (format pliku: {doc.format.value}):\n\n{doc.as_text()}"


def build_messages(doc: ExtractedDocument) -> list[Message]:
  return [
    {"role": "system", "content": system_prompt()},
    {"role": "user", "content": f"Tekst formularza (format pliku: docx):\n\n{EXAMPLE_INPUT}"},
    {"role": "assistant", "content": json.dumps(EXAMPLE_OUTPUT, ensure_ascii=False)},
    {"role": "user", "content": user_prompt(doc)},
  ]


def retry_prompt(error: ValidationError | str) -> str:
  if isinstance(error, ValidationError):
    details = "\n".join(
      f"- {'.'.join(str(p) for p in e['loc']) or '(całość)'}: {e['msg']}" for e in error.errors()[:20]
    )
  else:
    details = f"- {error}"
  return (
    "Twoja odpowiedź nie jest poprawnym obiektem FormSpec. Błędy walidacji:\n"
    f"{details}\n"
    "Zwróć ponownie CAŁY obiekt JSON, poprawiając te błędy. Tylko JSON."
  )
