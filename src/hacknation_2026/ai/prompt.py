"""Prompt for turning extracted form text into a FormSpec.

The few-shot example is an invented form; no content of the competition forms may live here.
"""

import json

from pydantic import ValidationError

from hacknation_2026.contracts import ExtractedDocument, FormSpec
from hacknation_2026.ai.client import Message

SYSTEM_PROMPT = """\
Jesteś analitykiem, który zamienia papierowe formularze urzędowe na opis formularza elektronicznego.
Dostajesz tekst odczytany z formularza i zwracasz WYŁĄCZNIE jeden obiekt JSON zgodny ze schematem FormSpec podanym niżej.
Bez komentarzy i bez Markdownu.

## Jak czytać tekst formularza
- "____" to miejsce do wpisania (linia z kropek, podkreślenie, pusta ramka, rząd kratek na znaki).
  Etykieta pola stoi obok ("PESEL ____", "w kwocie ____") albo w nawiasie w linii pod spodem
  ("____" i niżej "(imię i nazwisko)").
- Kilka linii "____" jedna pod drugą (np. pod "Uzasadnienie:") to JEDNO dłuższe pole (TEXTAREA), nie kilka pól.
- "[ ] etykieta" to kratka wyboru; "- " na początku linii to punktor listy.
- Wiersze "a | b | c" to tabela; "--- strona N ---" oddziela strony.
- Druk miał kilka kolumn, więc tekst z dwóch kolumn bywa sklejony w jedną linię,
  np. "(imię i nazwisko) Wójt Gminy X" to podpis pola z lewej kolumny i adresat z prawej.

## Co zwrócić
- "title": pełny tytuł z nagłówka formularza (linia zaczynająca się od WNIOSEK, ZGŁOSZENIE, DEKLARACJA
  albo OŚWIADCZENIE, razem z jej ciągiem dalszym w kolejnej linii). Niczego nie skracaj ani nie dopisuj;
  zapisz zwykłą polską pisownią ("Wniosek o ustalenie …"), bez numeru druku i podstawy prawnej. Maks. 255 znaków.
- "authority_name": urząd lub organ, do którego składa się formularz (np. "Urząd Gminy X", "Wójt Gminy Y").
  Zwykle stoi po słowie "Adresat:" albo w prawym górnym rogu druku. Jeśli go nie ma, "".
- "authority_kind": "ORGAN", gdy adresatem jest organ (wójt, burmistrz, prezydent miasta, starosta, marszałek, dyrektor);
  "URZAD", gdy adresatem jest urząd.
- "allows_other_person": true, gdy formularz zbiera dane osoby fizycznej (imię, nazwisko, PESEL) – taki wniosek
  zawsze można złożyć w swoim imieniu albo w imieniu innej osoby. false tylko wtedy, gdy wnioskodawcą może być
  wyłącznie firma lub instytucja.
- "allows_legal_entity": true, gdy wnioskodawcą może być firma, osoba prawna lub jednostka organizacyjna.
  Wystarczy słowo "nazwa" przy danych wnioskodawcy ("imię i nazwisko/nazwa", "nazwa firmy"), "siedziba",
  NIP, REGON lub KRS.
- "allows_proxy": true, gdy formularz wspomina pełnomocnika, pełnomocnictwo albo osobę upoważnioną.
- "consents": oświadczenia, które wnioskodawca potwierdza na druku ("Oświadczam, że …"), każde jako jedno krótkie zdanie
  w formie neutralnej płciowo ("Oświadczam, że posiadam …", nie "zostałem poinformowany"). Klauzulę informacyjną RODO
  i zgodę na przetwarzanie danych POMIŃ – system dodaje je sam. Brak oświadczeń: [].
- "pages": strony z polami MERYTORYCZNYMI (dotyczącymi przedmiotu sprawy).

## Czego NIE umieszczać w "pages"
Te części dokłada później system, więc POMIŃ je całkowicie:
- dane wnioskodawcy (imię, nazwisko, PESEL, nazwa firmy, NIP, REGON, KRS),
- adresy wnioskodawcy (zamieszkania, korespondencyjny, siedziby),
- dane kontaktowe wnioskodawcy (telefon, e-mail),
- dane pełnomocnika, dane innej osoby, opłata skarbowa za pełnomocnictwo,
- oświadczenia i zgody (trafiają do "consents"), klauzula RODO, pouczenia,
- miejscowość i data SPORZĄDZENIA wniosku z nagłówka ("X, dnia ____"), podpis, pieczęć, pola "wypełnia urząd".
Miejscowość, ulica czy adres, KTÓREGO DOTYCZY SPRAWA (np. położenie budynku lub działki), to pola merytoryczne – zostają.

## Strony i sekcje
- Pogrupuj pola merytoryczne w tematyczne strony (zwykle 1–2), np. "Informacje o …", "Szczegóły …".
  Tytuł strony i sekcji to krótki opis tematu (np. "Lokalizacja budynku"), nie tytuł formularza i nie numer punktu.
- Każda strona ma 1–4 sekcje; sekcja grupuje pola o jednym temacie. Sekcji nie zagnieżdżaj.
- "repeating": true tylko dla sekcji, którą użytkownik może dodać wiele razy (np. lista pozycji, kilka działek).
- Klucze ("key") sekcji i pól: snake_case, bez polskich znaków, unikalne w całym formularzu.

## Etykiety i opisy
- Etykieta ("label") to krótka nazwa pola zbudowana ze słów z formularza, bez numerów punktów, kropek i dwukropków.
  Nie dopisuj informacji, których na druku nie ma (np. z "przy ulicy ____" zrób "Ulica", nie "Ulica i numer budynku").
- Pisownia polska: wielka litera TYLKO na początku i w nazwach własnych – "Numer ewidencyjny działki",
  nie "Numer Ewidencyjny Działki". Tak samo tytuły stron, sekcji i opcji.
- "description": tylko gdy druk zawiera objaśnienie do pola (np. przypis, uwaga w nawiasie); nigdy nie powtarzaj
  etykiety. W przeciwnym razie "".

## Typy pól
- TEXT_FIELD – krótki tekst: nazwa, numer, identyfikator, miejscowość, numer działki, numer rachunku.
- TEXTAREA – dłuższy tekst: uzasadnienie, opis, uwagi, kilka pustych linii pod nagłówkiem.
- NUMBER – liczba lub kwota (np. kwota w zł, powierzchnia, liczba osób).
- DATEPICKER – data (dzień, okres "od–do" rozbij na dwa pola DATEPICKER).
- RADIO – wybór JEDNEJ opcji z co najwyżej 5 wzajemnie wykluczających się opcji (także "Tak"/"Nie").
- SELECT – wybór jednej opcji, gdy opcji jest WIĘCEJ niż 5.
- CHECKBOX – wybór WIELU niezależnych opcji z listy (np. "zaznacz wszystkie, które dotyczą").
  Nigdy nie używaj CHECKBOX do zgód ani oświadczeń – te idą do "consents".
- FILE_UPLOADER – załącznik, który trzeba dołączyć (np. kopia dokumentu, mapa, zaświadczenie).
  Każdy załącznik wymieniony z nazwy to osobne pole FILE_UPLOADER w sekcji "Załączniki".
  Puste pozycje listy załączników ("2) ____") pomiń.
- TEXT_BLOCK – tekst informacyjny bez odpowiedzi użytkownika (ważne wyjaśnienie dla wnioskodawcy); "required": false.
- "options" wypełniaj tylko dla RADIO, CHECKBOX i SELECT (pełne nazwy opcji z druku); dla innych typów [].

## Wymagalność
- "required": true dla pól koniecznych do załatwienia sprawy.
- "required": false, gdy pole jest oznaczone przypisem lub gwiazdką objaśnioną jako "dane nieobowiązkowe",
  "opcjonalne", "jeśli dotyczy", albo ma dopisek "(opcjonalnie)". Przypis wygląda jak "ulicy1)" przy polu
  i "1) Dane nieobowiązkowe." na dole strony.

## Zależności (show_if)
- Gdy pole lub sekcja ma sens tylko po wybraniu konkretnej opcji innego pola (np. "jeśli tak, podaj…",
  "w przypadku zwrotu – numer rachunku"), dodaj "show_if": [{"field": "<key pola sterującego>", "equals": "<dokładna nazwa opcji>"}].
- "____" stojące przy opcji wyboru (np. "1) zaliczyć na poczet zobowiązania z tytułu ____") to osobne pole zależne
  od tej opcji – nie gub go.
- Pole sterujące musi być typu RADIO, SELECT lub CHECKBOX i musi występować w formularzu przed polem zależnym.
- Wiele warunków w "show_if" oznacza, że wszystkie muszą być spełnione.

## Schemat FormSpec (JSON Schema)
{schema}
"""

EXAMPLE_INPUT = """\
--- strona 1 ---
Przykładowo, dnia ____
____ Adresat:
(imię i nazwisko / nazwa wnioskodawcy) Burmistrz Miasta Przykładowo
____
(adres)
WNIOSEK
o wydanie zezwolenia na usunięcie drzewa
Działka nr ____ obręb ____
Gatunek drzewa ____ Obwód pnia na wys. 130 cm (cm) ____
Przyczyna usunięcia:
[ ] zagrożenie bezpieczeństwa
[ ] budowa
[ ] inna – opisz: ____
Planowany termin usunięcia ____
Numer telefonu do kontaktu w sprawie oględzin1) ____
Załączniki:
1) rysunek z lokalizacją drzewa
2) ____
Oświadczam, że posiadam tytuł prawny do władania nieruchomością.
Przetwarzanie danych osobowych: administratorem danych jest Burmistrz Miasta Przykładowo...
____
(podpis wnioskodawcy)
1) Dane nieobowiązkowe.
"""

EXAMPLE_OUTPUT = {
  "title": "Wniosek o wydanie zezwolenia na usunięcie drzewa",
  "authority_name": "Burmistrz Miasta Przykładowo",
  "authority_kind": "ORGAN",
  "allows_other_person": True,
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
          {"key": "opis_przyczyny", "label": "Opis przyczyny", "type": "TEXTAREA", "required": True,
           "description": "", "options": [], "show_if": [{"field": "przyczyna_usuniecia", "equals": "Inna"}]},
          {"key": "planowany_termin_usuniecia", "label": "Planowany termin usunięcia", "type": "DATEPICKER",
           "required": True, "description": "", "options": [], "show_if": []},
          {"key": "telefon_oglediny", "label": "Numer telefonu do kontaktu w sprawie oględzin", "type": "TEXT_FIELD",
           "required": False, "description": "", "options": [], "show_if": []},
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
    {"role": "user", "content": f"Tekst formularza (format pliku: pdf):\n\n{EXAMPLE_INPUT}"},
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
