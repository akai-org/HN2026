# Blok B3 – Ekstrakcja: XLSX i ODS

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

> **Status: zrobione.** `extract/sheet.py`, testy w `tests/extract_sheet/`. Zależność: `openpyxl`. ODS czytany z `content.xml` przez `lxml` (już w projekcie przez `python-docx`), więc `odfpy` okazał się zbędny.
> - Pola do wpisania w arkuszu to puste komórki z ramką, a nie tekst. Pusta komórka lub scalony zakres z ramką daje `____`, ciąg kratek (np. NIP po cyfrze) daje jedno `____`, a pojedyncza komórka z pełną ramką tuż przed tekstem daje checkbox.
> - Linie wizualne: komórki nachodzące na siebie w pionie tworzą jedną linię (podkreślenie scalone od wiersza wyżej niż etykieta trafia do tej samej linii). Każdy widoczny arkusz to osobna strona.
> - Uproszczenia: siatki tabel wychodzą jako linie tekstu, a nie `Block(kind="table")`; `number-rows-repeated` w ODS traktowane jako puste wypełnienie.

## Zadanie

**Pliki:** `src/hacknation_2026/extract/sheet.py`, `tests/extract_sheet/`

**Interfejs:**
```python
def extract_xlsx(data: bytes) -> ExtractedDocument
def extract_ods(data: bytes) -> ExtractedDocument
```

**Wymagania:**
- XLSX: `openpyxl` (MIT), ODS: `odfpy` (Apache 2.0).
- Arkusze to w praktyce formularze ułożone w komórkach. Scalone komórki z tekstem dają `Block(kind="text")`, a obszary siatki dają `Block(kind="table")`. Pomijaj puste wiersze. Strona to numer arkusza.

**Gotowe, gdy:** dla wszystkich `.xlsx`/`.ods` z blankietów `as_text()` zawiera tytuł i nagłówki sekcji.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
