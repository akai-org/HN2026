# Blok A – Walidacja pliku

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

> **Status: zrobione.** `src/hacknation_2026/ingest/validation.py`, testy w `tests/ingest/`. Bez nowych zależności (magic bytes ręcznie, ZIP przez `zipfile`). Dodatkowo publiczna `detect_format(data)`. Uproszczenie: każdy kontener OLE2 to DOC (także .xls), bez sprawdzania strumienia `WordDocument`.

## Zadanie

**Pliki:** `src/hacknation_2026/ingest/validation.py`, `tests/ingest/`

**Interfejs:**
```python
def validate_upload(filename: str, data: bytes, max_size_bytes: int) -> FileFormat  # albo raise AppError
```

**Wymagania:**
- Nazwa: maks. 250 znaków, zakazane `; : > < / \ | ' * % $` → `AppError("INVALID_FILENAME", ..., 422)`.
- Rozmiar > limit → `AppError("FILE_TOO_LARGE", ..., 413)`.
- Typ z **zawartości** (magic bytes, np. `puremagic` albo ręcznie):
  - PDF `%PDF`, PNG, JPEG `FF D8 FF`, OLE2 `D0 CF 11 E0` → DOC,
  - ZIP: `word/` → DOCX, `xl/` → XLSX, plik `mimetype` = `application/vnd.oasis.opendocument.spreadsheet` → ODS.
- Dozwolone rozszerzenia (bez rozróżniania wielkości liter) i akceptowane typy treści:
  - `.pdf` → PDF,
  - `.doc`/`.docx` → DOC albo DOCX (w danych są `.DOC` z treścią DOCX),
  - `.ods` → ODS, `.xlsx` → XLSX,
  - `.jpg`/`.jpeg` → JPEG, `.png` → PNG.
- Niezgodność → `AppError("MIME_MISMATCH", ..., 415)`. Nieobsługiwane rozszerzenie → `AppError("UNSUPPORTED_FORMAT", ..., 415)`.
- Zwracany `FileFormat` opisuje **faktyczną treść**.

**Gotowe, gdy:** testy dla każdego pliku z `dane_zadania/blankiety/` (wszystkie są poprawne poza `.JPE` w formularzu 7, który ma być odrzucony) oraz testy negatywne: zła nazwa, za duży plik, PDF przemianowany na `.png`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
