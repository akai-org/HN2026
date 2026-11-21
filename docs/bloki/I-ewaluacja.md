# Blok I – Ewaluacja

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

**Używa interfejsów innych bloków:** `pipeline.convert()` z bloku G (`docs/bloki/G-api-pipeline.md`) i `check_form()` z bloku F (`docs/bloki/F-kontrola-regul.md`). Do czasu ich ukończenia mockuj je w swoich testach.

## Zadanie

**Pliki:** `scripts/evaluate.py`, `tests/evaluate/`

**Interfejs:** `uv run python scripts/evaluate.py [--out wyniki/]`, woła `pipeline.convert()` (G).

**Wymagania:**
- Przechodzi po wszystkich plikach z `dane_zadania/blankiety/` i zapisuje wynikowe JSON-y do `wyniki/<formularz>/<plik>.json`. Te pliki są potrzebne do zgłoszenia.
- Dla formularzy 1 i 5 liczy podobieństwo do wzorca:
  - zgodność tytułów stron,
  - pokrycie etykiet pól (dopasowanie po znormalizowanym `title`),
  - zgodność typów dopasowanych pól,
  - liczbę `states`.
- Dla wszystkich formularzy: liczba naruszeń z `check_form` i zgodność wyników między formatami tego samego formularza (te same etykiety pól).
- Raport w konsoli (tabela) i `wyniki/raport.json`.

**Gotowe, gdy:** skrypt działa end-to-end na zamockowanym `convert` (test), a po złożeniu bloków A–G na prawdziwym pipeline.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
