# Blok J – Poprawa detekcji (ekstrakcja i metadane)

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonych bloków 0, B1 i B2. Typy (`Block`, `ExtractedDocument`, `FormSpec`…) importuj z `hacknation_2026.contracts`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

**Skąd ten blok:** pierwsze próby lokalnego modelu (`docs/wybor-modelu.md`, skrypt `scripts/llm_probe.py`) pokazały, że model dobrze zamienia tekst na pola, ale traci dane przez błędy na wejściu:
- organ w formularzu 1 ginie, bo dwie kolumny są sklejone w jedną linię,
- flaga „wnioskodawcą może być firma” jest zawsze `false`,
- ze skanów znikają pola, bo OCR gubi linie z kropek.

Zadania J1–J6 są od siebie niezależne. Każde może zrobić inny agent, bo dotykają różnych plików.

> **Stan 2026-11-21 (wdrożone):** `extract/fields.py` (OpenCV) wykrywa na obrazie strony linie do wpisania (podkreślenia, linie z kropek, także sklejone z tekstem), ramki, kratki i rzędy kratek na znaki. Używa go `image.py` (skany: znaczniki wstawiane między słowa z Tesseracta po położeniu) i `pdf.py` (grafika wektorowa po zamalowaniu znaków tekstu, także w komórkach tabel). To realizuje **J3 i J7**. W `word.py` doszły tabulatory z wypełnieniem kropkami, podkreślone spacje i tabulatory oraz pola FORMTEXT. Pomiar `scripts/ocr_benchmark.py`: liczba pól z obrazu = wzorzec z PDF (formularz 9: 161/161, 6: 45/45, skan 5: 19/19), odczyt słów 98%. Otwarte: J1 (kolumny), J4, J5, tabulatory z kropkami w binarnym `.doc`.

## Zadanie

### J1 – Rozdzielanie kolumn w PDF

**Pliki:** `src/hacknation_2026/extract/pdf.py`, `tests/extract_pdf_image/test_columns.py`

- W `_page_blocks` linia z dużą poziomą przerwą między znakami (np. > 40 pt, do dobrania na danych) jest dzielona na osobne bloki: lewa i prawa kolumna, w tej kolejności.
- Przykłady z danych:
  - formularz 1: `(imię i nazwisko/nazwa wnioskodawcy) Wójt Gminy Elbląg`,
  - formularz 3: `/ adres / Urząd Miasta i Gminy Młynary`.
- Nie psuć linii z `____` między etykietą a wartością (np. `PESEL * ____`) ani wierszy tabel.

**Gotowe, gdy:** w formularzach 1 i 3 (PDF) etykieta i nazwa urzędu są w osobnych blokach, a dotychczasowe testy B1 przechodzą.

### J2 – Metadane formularza regułami

**Pliki:** `src/hacknation_2026/extract/metadata.py`, `tests/metadata/`

**Interfejs:**
```python
class FormHints(BaseModel):
  title: str | None = None
  authority_name: str | None = None
  authority_kind: Literal["URZAD", "ORGAN"] | None = None
  allows_legal_entity: bool | None = None
  allows_other_person: bool | None = None
  allows_proxy: bool | None = None

def detect_metadata(doc: ExtractedDocument) -> FormHints   # None = nie wiadomo, decyduje model
```

**Reguły (bez LLM, wyrażenia regularne na `doc.blocks`):**
- **tytuł:** pierwsza linia zaczynająca się od `WNIOSEK|ZGŁOSZENIE|DEKLARACJA|OŚWIADCZENIE`. Jeśli to samo słowo, dołącz następną linię (np. `WNIOSEK` / `o stwierdzenie nadpłaty podatku`). Zapis zwykłą polską pisownią.
- **organ:** linia po `Adresat:` albo pierwsze dopasowanie `(Urząd|Wójt|Burmistrz|Prezydent|Starosta|Rada) …`. `authority_kind` to `ORGAN` dla osoby-organu (Wójt, Burmistrz, Prezydent, Starosta), w pozostałych przypadkach `URZAD`.
- **firma:** w części z danymi wnioskodawcy (przed tytułem) słowa „firma”, „siedziba”, „nazwa wnioskodawcy”, NIP, REGON.
- **pełnomocnik / inna osoba:** „pełnomocnik”, „upoważniona”, „w imieniu”.

Blok C dołoży te wskazówki do promptu i nadpisze nimi pola `FormSpec`, gdy nie są `None`. Do czasu bloku C to tylko funkcja z testami.

**Gotowe, gdy:** testy na PDF wszystkich 9 blankietów: tytuł i organ zgadzają się z blankietem (wartości spisane ręcznie w teście), w formularzu 5 `allows_legal_entity == True`.

### J3 – Linie do wypełnienia w OCR

**Pliki:** `src/hacknation_2026/extract/image.py`, `tests/extract_pdf_image/test_blank_lines.py`

- Przed OCR wykryj na obrazie poziome linie z kropek lub kresek, np. przez rzut pikseli w wierszu (Pillow, bez nowych zależności): długi odcinek z regularnymi ciemnymi punktami lub ciągłą kreską.
- Każdą taką linię wstaw do wyniku jako blok `____` na swojej wysokości, w kolejności czytania razem z liniami OCR. Linia leżąca obok tekstu w tym samym wierszu dokleja `____` do tego wiersza.

**Gotowe, gdy:** OCR formularza 5 (PNG) zawiera `Uzasadnienie` z `____` pod spodem i `____` po „rachunek”, a dotychczasowe testy B1 przechodzą.

### J4 – Checkboxy-kształty i kolejność ramek w DOCX

**Pliki:** `src/hacknation_2026/extract/word.py` (część DOCX), `tests/extract_word/test_shapes.py`

- **Kształty:** mały kwadratowy kształt (`wps:wsp` z `a:prstGeom prst="rect"` albo `v:rect`, bok ok. 0,3–0,6 cm z `wp:extent` lub stylu VML) bez tekstu, zakotwiczony w akapicie, staje się `☐` na początku tego akapitu. Dotyczy DOCX skonwertowanych z PDF (formularze 2 i 8).
- **Kolejność ramek:** ramki tekstowe z pozycją bezwzględną (`wp:anchor` z `wp:positionV`/`wp:positionH`) sortuj po (strona, y, x), a nie w kolejności zapisu.

**Gotowe, gdy:** formularz 8 (DOCX) ma checkboxy przy opcjach „1. właściciel/współwłaściciel…”, a jego tekst idzie w kolejności stron 1/6 → 6/6.

### J5 – Punktory i ramki w binarnym DOC

**Pliki:** `src/hacknation_2026/extract/word.py` (część DOC), `tests/extract_word/test_doc_lists.py`

- Odczyt list z binarnego Worda ([MS-DOC]: `PlfLst`/`PlfLfo` w strumieniu tabeli i `sprmPIlfo`/`sprmPIlvl` we właściwościach akapitów). Punktor kratki daje checkbox, inny punktor daje `- `, tak samo jak w DOCX.
- Kolejność ramek tekstowych po pozycji (`PlcfSpa` / FSPA).
- To najtrudniejsze zadanie w bloku i dotyczy tylko starego formatu. Jedyny sposób na punktory i kratki z list w `.doc`, bo konwersji przez LibreOffice nie używamy (J6).

**Gotowe, gdy:** formularz 3 (`.doc`) ma punktory `- `, a formularz 9 (`.doc`) ma te same checkboxy co DOCX.

### J6 – Konwersja do PDF przez LibreOffice – ODRZUCONE

Sprawdzone 2026-11-21 na wszystkich blankietach: konwersja gubiła tekst z ramek tekstowych (formularz 8 DOCX bez tekstu na stronach 1–3, formularz 2 DOCX połowa tekstu), a w arkuszach pola i kratki zamieniały się w samą grafikę. Pomagała tylko przy binarnym `.doc` (punktory, kratki z list). Decyzja zespołu: nie używamy. Pliki biurowe czyta się bezpośrednio (B2, B3).

## Zasady wspólne

- Każde zadanie J1–J6 **ma na wyłączność** wymienione pliki. Zadania J1 i J3 dotykają innych plików niż J4 i J5, więc mogą iść równolegle. J4 i J5 edytują różne części `word.py`, więc albo robi je jeden agent, albo kolejno.
- Po każdej zmianie sprawdź jakość na modelu: `uv run python scripts/llm_probe.py <plik>` na formularzach 1 i 5 przed i po. Wynik dopisz do `docs/wybor-modelu.md`.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add`.
- Testy: `uv run pytest tests/`. Zadanie jest skończone, gdy jego testy i wszystkie dotychczasowe przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL, żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.** Wartości z blankietów wolno wpisywać tylko do testów.
