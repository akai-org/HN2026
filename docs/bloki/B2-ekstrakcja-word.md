# Blok B2 – Ekstrakcja: DOCX i DOC

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

## Zadanie

**Pliki:** `src/hacknation_2026/extract/word.py`, `tests/extract_word/`

**Interfejs:**
```python
def extract_docx(data: bytes) -> ExtractedDocument
def extract_doc(data: bytes) -> ExtractedDocument     # stary binarny Word (OLE2)
```

**Wymagania:**
- DOCX: `python-docx` (MIT). Akapity i tabele w kolejności dokumentu (iteruj po `document.element.body`), znaki ☐/☒ jako checkbox.
- **DOC:** 7 z 9 plików `.doc` w danych to binarny Word (OLE2), którego `python-docx` **nie otwiera** (sprawdzone). Do wyboru przez agenta, z uzasadnieniem w docstringu:
  1. `olefile` (BSD): czytanie strumienia `WordDocument` i tabeli fragmentów (piece table), czyli wyciągnięcie samego tekstu;
  2. konwersja do DOCX zewnętrznym LibreOffice w tmp (licencja MPL, do potwierdzenia z mentorami).

  Nie wolno używać antiworda ani textracta (GPL).

**Gotowe, gdy:** dla wszystkich `.doc`/`.docx` z `dane_zadania/blankiety/` `as_text()` zawiera tytuł formularza.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
