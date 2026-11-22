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
- "is_form": najpierw oceń, czy dokument jest FORMULARZEM do wypełnienia i złożenia: wniosek, podanie, zgłoszenie,
  deklaracja, oświadczenie albo formularz (np. ofertowy) składany do urzędu, instytucji lub pracodawcy, po polsku.
  "is_form": false, gdy to coś innego, np. menu, cennik, oferta handlowa, plan lekcji, rozkład jazdy, program wydarzenia,
  instrukcja obsługi lub wypełniania, artykuł, uchwała, klauzula informacyjna, wzór umowy, ankieta, test lub egzamin,
  paragon, wykres, karta postaci z gry, formularz w innym języku niż polski. Wtedy "not_form_reason" to krótki opis,
  czym jest dokument (np. "menu restauracji"), "pages": [] i "consents": [], a "title" przepisz z dokumentu.
  Gdy to formularz: "is_form": true i "not_form_reason": "".
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
  Do "consents" trafia tylko zdanie do potwierdzenia BEZ pól do wpisania. Część zatytułowana "Oświadczenie o …",
  w której wpisuje się liczby, kwoty czy daty, to pola merytoryczne. Oświadczenie z kratką, od którego zależą dalsze
  pola lub wysokość opłaty (np. "[ ] Oświadczam, że nieruchomość ma kompostownik"), to pole CHECKBOX, nie zgoda.
- "pages": strony z polami MERYTORYCZNYMI (dotyczącymi przedmiotu sprawy).

## Czego NIE umieszczać w "pages"
Te części dokłada później system, więc POMIŃ je całkowicie:
- dane wnioskodawcy (imię, nazwisko, PESEL, nazwa firmy, NIP, REGON, KRS),
- adresy wnioskodawcy (zamieszkania, korespondencyjny, siedziby),
- dane kontaktowe wnioskodawcy (telefon, e-mail),
- dane pełnomocnika oraz osoby, W IMIENIU KTÓREJ składa się wniosek, opłata skarbowa za pełnomocnictwo,
  a także załączniki o pełnomocnictwie (dokument pełnomocnictwa, dowód opłaty skarbowej za pełnomocnictwo),
- oświadczenia i zgody (trafiają do "consents"), klauzula RODO, pouczenia, instrukcje wypełniania druku,
- miejscowość i data SPORZĄDZENIA wniosku z nagłówka ("X, dnia ____"), podpis, pieczęć, pola "wypełnia urząd".

## Co ZOSTAJE w "pages" (nie gub tych pól)
- Miejscowość, ulica czy adres, KTÓREGO DOTYCZY SPRAWA (np. położenie budynku, działki, miejsce robót).
- Dane OSÓB TRZECICH związanych ze sprawą: kandydat do nagrody, dziecko, współmałżonek, wykonawca robót,
  osoba odpowiedzialna, właściciel zwierzęcia, podopieczni – z imieniem, nazwiskiem i pozostałymi polami z druku.
- Rola wnioskodawcy w sprawie, także gdy stoi w części z jego danymi (np. "Składający: [ ] właściciel [ ] najemca
  [ ] zarządca") i wybór rodzaju wnioskodawcy, gdy od niego zależą dalsze pola (np. "osoba fizyczna / klub sportowy").
- Sposób odbioru lub doręczenia odpowiedzi (np. poczta, ePUAP, odbiór osobisty), terminy, okresy, liczby, kwoty.
- Opłata za samą sprawę (np. "opłata skarbowa wynosi 17 zł", numer konta): pole TEXT_BLOCK z kwotą i numerem konta
  oraz FILE_UPLOADER "Potwierdzenie zapłaty".
Przejdź przez WSZYSTKIE strony tekstu do końca. Każde "____" i każda kratka musi trafić do jakiegoś pola albo
należeć do części pomijanej wyżej – formularz wielostronicowy daje odpowiednio więcej stron i sekcji.

## Dane wnioskodawcy, które zostają w "pages"
- "applicant_data": true dla pola, w które wnioskodawca wpisuje SWOJE dane osobowe niewymienione wyżej, np. data urodzenia,
  miejsce urodzenia, obywatelstwo, imię ojca, nazwisko rodowe, stan cywilny, adres zameldowania. System może wypełnić
  takie pole danymi z rejestru.
- "applicant_data": false dla wszystkich innych pól, także dla danych innej osoby (małżonka, dziecka, zmarłego,
  właściciela) i danych przedmiotu sprawy.

## Strony i sekcje
- Pogrupuj pola merytoryczne w tematyczne strony, np. "Informacje o …", "Szczegóły …"; tyle stron, ile tematów.
  Tytuł strony i sekcji to krótki opis tematu (np. "Lokalizacja budynku"), nie tytuł formularza i nie numer punktu.
- Każda strona ma 1–4 sekcje; sekcja grupuje pola o jednym temacie. Sekcji nie zagnieżdżaj.
- "repeating": true dla sekcji, którą użytkownik może dodać wiele razy: druk powtarza ten sam blok
  ("1. Dane podopiecznego", "2. Dane podopiecznego", …), ma kilka identycznych wierszy tabeli albo pisze
  "w przypadku więcej niż jednego … dołącz kolejną tabelę". Wtedy opisz blok RAZ jako sekcję powtarzalną.
- Klucze ("key") sekcji i pól: snake_case, bez polskich znaków, unikalne w całym formularzu.

## Etykiety i opisy
- Etykieta ("label") to krótka nazwa pola zbudowana ze słów z formularza, bez numerów punktów, kropek i dwukropków.
  Etykieta pola wyboru (RADIO, CHECKBOX, SELECT) to pełne pytanie albo polecenie, nie urwane zdanie z druku:
  z "Proszę o wydanie zaświadczenia o:" zrób "Wybierz, czego ma dotyczyć zaświadczenie",
  z "Kwotę nadpłaty proszę:" zrób "Wybierz, co zrobić z kwotą nadpłaty".
  Nie dopisuj informacji, których na druku nie ma (np. z "przy ulicy ____" zrób "Ulica", nie "Ulica i numer budynku").
- Pisownia polska: wielka litera TYLKO na początku i w nazwach własnych – "Numer ewidencyjny działki",
  nie "Numer Ewidencyjny Działki". Tak samo tytuły stron, sekcji i opcji.
- "description": tylko gdy druk zawiera objaśnienie do pola (np. przypis, uwaga w nawiasie); nigdy nie powtarzaj
  etykiety. Instrukcje dotyczące papieru ("niepotrzebne skreślić", "zaznaczyć właściwą kratkę", "wypełnić drukowanymi
  literami") pomiń. W przeciwnym razie "".

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
  Puste pozycje listy załączników ("2) ____") pomiń. Lista załączników z kratkami ("Załącznik A [ ] TAK [ ] NIE")
  to także pola FILE_UPLOADER ("required": false), nie CHECKBOX.
- TEXT_BLOCK – tekst informacyjny bez odpowiedzi użytkownika (ważne wyjaśnienie dla wnioskodawcy); "required": false.
- Warianty rozdzielone ukośnikiem z gwiazdką objaśnioną jako "niepotrzebne skreślić" (np. "wynajem/użyczenie*",
  "hodowanie/utrzymywanie* charta/chartów*") to wybór: pole RADIO, którego opcjami są te warianty
  ("Wynajem", "Użyczenie"). Kilka takich grup w jednym zdaniu to osobne pola RADIO. Pomijasz tylko sam dopisek
  "niepotrzebne skreślić", nigdy wybór.
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
- Warunki na RÓŻNE pola muszą być spełnione wszystkie; kilka opcji TEGO SAMEGO pola oznacza "którakolwiek z nich"
  (np. numer pokaż przy "Mikroprocesor" albo "Tatuaż": dwa warunki na to samo pole).
- "show_if" może mieć także cała sekcja. Gdy druk łączy kilka wariantów wniosku albo części "wypełnić tylko w przypadku …",
  dodaj pole wyboru wariantu i nadaj "show_if" sekcjom, które dotyczą tylko jednego wariantu.

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
Przyczyna usunięcia:
[ ] zagrożenie bezpieczeństwa
[ ] budowa
[ ] inna – opisz: ____
Planowany termin usunięcia ____
Usunięcie wykona (imię i nazwisko wykonawcy) ____
Numer telefonu do kontaktu w sprawie oględzin1) ____
Drzewo nr 1: gatunek ____ obwód pnia na wys. 130 cm (cm) ____
Drzewo nr 2: gatunek ____ obwód pnia na wys. 130 cm (cm) ____
Opłata skarbowa wynosi 50 zł, konto urzędu: 11 2222 3333 4444 5555 6666 7777
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
  "is_form": True,
  "not_form_reason": "",
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
        "key": "drzewa", "title": "Drzewa do usunięcia", "repeating": True, "show_if": [],
        "fields": [
          {"key": "gatunek_drzewa", "label": "Gatunek drzewa", "type": "TEXT_FIELD", "required": True,
           "description": "", "options": [], "show_if": []},
          {"key": "obwod_pnia", "label": "Obwód pnia (cm)", "type": "NUMBER", "required": True,
           "description": "Zmierz na wysokości 130 cm.", "options": [], "show_if": []},
        ],
      },
      {
        "key": "usuniecie", "title": "Przyczyna i termin usunięcia", "repeating": False, "show_if": [],
        "fields": [
          {"key": "przyczyna_usuniecia", "label": "Wybierz przyczynę usunięcia", "type": "RADIO", "required": True,
           "description": "", "options": ["Zagrożenie bezpieczeństwa", "Budowa", "Inna"], "show_if": []},
          {"key": "opis_przyczyny", "label": "Opis przyczyny", "type": "TEXTAREA", "required": True,
           "description": "", "options": [], "show_if": [{"field": "przyczyna_usuniecia", "equals": "Inna"}]},
          {"key": "planowany_termin_usuniecia", "label": "Planowany termin usunięcia", "type": "DATEPICKER",
           "required": True, "description": "", "options": [], "show_if": []},
          {"key": "wykonawca_usuniecia", "label": "Imię i nazwisko wykonawcy usunięcia", "type": "TEXT_FIELD",
           "required": True, "description": "", "options": [], "show_if": []},
          {"key": "telefon_oglediny", "label": "Numer telefonu do kontaktu w sprawie oględzin", "type": "TEXT_FIELD",
           "required": False, "description": "", "options": [], "show_if": []},
        ],
      },
    ],
  }, {
    "title": "Opłata i załączniki",
    "sections": [
      {
        "key": "oplata", "title": "Opłata", "repeating": False, "show_if": [],
        "fields": [
          {"key": "informacja_o_oplacie", "label": "Informacja o opłacie", "type": "TEXT_BLOCK", "required": False,
           "description": "Opłata skarbowa wynosi 50 zł. Przelej ją na konto urzędu: 11 2222 3333 4444 5555 6666 7777.",
           "options": [], "show_if": []},
          {"key": "potwierdzenie_zaplaty", "label": "Potwierdzenie zapłaty", "type": "FILE_UPLOADER", "required": True,
           "description": "", "options": [], "show_if": []},
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


MAX_LISTED_LINES = 40


def completion_prompt(lines: list[str]) -> str:
  """Asks for the parts of a long form the first answer left out (see analyze.uncovered_lines)."""
  listing = "\n".join(f"- {line[:200]}" for line in lines[:MAX_LISTED_LINES])
  return (
    "W Twojej odpowiedzi brakuje części formularza. Te linie z miejscem do wpisania albo z kratką nie mają "
    "odpowiednika w żadnym polu:\n"
    f"{listing}\n\n"
    "Opisz brakujące części merytoryczne jako DODATKOWE strony z sekcjami i polami, według tych samych zasad co wcześniej "
    "(typy pól, wymagalność, show_if, sekcje powtarzalne). Pomiń linie z części pomijanych (dane wnioskodawcy, jego adres "
    "i kontakt, data i miejsce sporządzenia, podpis, pola wypełniane przez urząd) oraz pola, które już są w Twojej "
    "odpowiedzi. Klucze nowych pól i sekcji muszą być inne niż już użyte; show_if może wskazywać pola z Twojej odpowiedzi.\n"
    'Zwróć TYLKO obiekt JSON {"pages": [...]} z nowymi stronami. Gdy niczego merytorycznego nie brakuje: {"pages": []}.'
  )
