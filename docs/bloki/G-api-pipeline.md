# Blok G – API i pipeline

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

**Używa interfejsów innych bloków:** `validate_upload` (A: `A-walidacja-pliku.md`), `extract_*` (B1/B2/B3: `B1-…`, `B2-…`, `B3-…`), `analyze` (C: `C-analiza-llm.md`), `build_form` (D: `D-builder.md`), `check_form` (F: `F-kontrola-regul.md`). Wszystkie w `docs/bloki/`, sekcje Interfejs. Do czasu ich ukończenia mockuj je w swoich testach.

## Zadanie

**Pliki:** `src/hacknation_2026/app.py`, `src/hacknation_2026/api/`, `src/hacknation_2026/pipeline.py`, `src/hacknation_2026/extract/__init__.py` (dispatcher), `tests/api/`

**Interfejs:**
```python
# pipeline.py
def convert(filename: str, data: bytes, settings: Settings) -> ConvertResult
#   validate_upload (A) → extract_* (B, wybór po FileFormat) → analyze (C) → build_form (D) → check_form (F → warnings)
```

**Wymagania:**
- `POST /api/forms/convert` (multipart, jeden plik) → `ConvertResult`. Odczyt pliku z limitem rozmiaru, bez zapisu na dysk. Ciężką pracę uruchamiaj w `run_in_threadpool`.
- `GET /api/health` → dokłada stan LLM (`GET {llm_base_url}/api/tags`).
- `AppError` → `JSONResponse(status, {"code", "message"})`.
- Do czasu bloków A–F testy używają `monkeypatch` na funkcjach pipeline'u.

**Gotowe, gdy:** testy API: zły plik → kod z bloku A, poprawny plik z zamockowanym pipeline'em → 200 z `form`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
