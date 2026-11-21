# Blok B1 – Ekstrakcja: PDF i obrazy

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

> **Status: zrobione.** `extract/pdf.py`, `extract/image.py`, wspólne pomocnicze `extract/_text.py` (do użycia w B2/B3), testy w `tests/extract_pdf_image/`.
> - Interfejs ma dodatkowy parametr `lang: str = "pol"`, w który G przekazuje `Settings.ocr_lang`.
> - Kropki i podkreślenia do wypełnienia są zamieniane na `____`. Checkbox na początku linii daje `Block(kind="checkbox")`, kilka checkboxów w linii (także w tabelach) daje `[ ]` w tekście.
> - Glify z fontów symbolicznych: kratki (Wingdings o/¨/q, SymbolMT `\uf092`, ❑ ☐ □) to checkbox, strzałka Wingdings ⇨ (`\uf0f0`) to punktor `-`, pozostałe glify to `•`.
> - OCR: Tesseract `--psm 11`, linie grupowane po pozycji, długie obrazy cięte na strony A4, słowa o pewności < 40 zamieniane na `____`.
> - Znane ograniczenia: OCR gubi część drobnych podpisów pod liniami z kropek; checkboxy narysowane w komórkach tabel (formularz 8) nie są oznaczane. Wszystkie PDF-y w danych mają warstwę tekstu, więc ścieżkę skanu PDF testuje obraz zapisany jako PDF.
> - Wymaga systemowego `tesseract` z językiem `pol` (lokalnie dograny `pol.traineddata` z `tessdata_fast`, w Dockerze pakiet `tesseract-ocr-pol`).

## Zadanie

**Pliki:** `src/hacknation_2026/extract/pdf.py`, `src/hacknation_2026/extract/image.py`, `tests/extract_pdf_image/`

**Interfejs:**
```python
def extract_pdf(data: bytes) -> ExtractedDocument
def extract_image(data: bytes, fmt: FileFormat) -> ExtractedDocument
```

**Wymagania:**
- PDF z warstwą tekstu: `pdfplumber` (MIT). Tekst w kolejności czytania, tabele jako `Block(kind="table")`, kratki i ☐ jako `Block(kind="checkbox")`.
- PDF bez tekstu (skan): wyrenderuj strony `pypdfium2` (Apache/BSD) i zrób OCR jak dla obrazu.
- Obrazy: OCR Tesseract (`pytesseract`, język z `Settings.ocr_lang`). Wymaga systemowego `tesseract` z `pol`; na Macu `brew install tesseract tesseract-lang`.
- Wszystko w pamięci (`io.BytesIO`), bez zapisu na dysk.

**Gotowe, gdy:** dla PDF/JPG/PNG formularzy 1 i 5 `as_text()` zawiera kluczowe etykiety z blankietu, np. tytuł i nagłówki sekcji (sprawdź ręcznie, wpisz do testu).

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
