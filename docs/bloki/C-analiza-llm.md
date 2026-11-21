# Blok C – Analiza LLM

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

## Zadanie

**Pliki:** `src/hacknation_2026/ai/` (`client.py`, `prompt.py`, `analyze.py`), `tests/ai/`

**Interfejs:**
```python
def analyze(doc: ExtractedDocument, settings: Settings) -> FormSpec
```

**Wymagania:**
- Lokalna Ollama przez HTTP (`httpx`), `POST {llm_base_url}/api/chat` z `format` = `FormSpec.model_json_schema()` i `temperature=0`. Wynik parsuje `FormSpec.model_validate_json`. Przy błędzie walidacji ponów raz, dokładając komunikat błędu do promptu.
- Prompt po polsku, a w nim:
  - opis typów pól i kiedy którego użyć, zgodnie ze Standardami (dropdown > 5 opcji, zgody nie jako checkbox…),
  - polecenie, by **pominąć** dane wnioskodawcy, adres, kontakt, zgody i podpis, bo te sekcje dokłada builder; wystarczą flagi i `consents`,
  - grupowanie pól merytorycznych w tematyczne strony i sekcje,
  - warunki `show_if` dla pól zależnych.
- Wybór modelu: przetestuj 2–3 modele (np. Bielik 11B v2, Qwen2.5 7B/14B Instruct; licencje Apache 2.0) na tekstach formularzy 1 i 5. Kryterium to porównanie z merytorycznymi stronami wzorców (np. „Informacje o nadpłacie”). Wynik zapisz w `docs/wybor-modelu.md`.
- Few-shot **nie** może zawierać treści blankietów z danych (zakaz treści formularzy w kodzie). Jeśli potrzebny, użyj wymyślonego, krótkiego formularza.

**Gotowe, gdy:** testy jednostkowe z zamockowanym HTTP (poprawna odpowiedź, zła odpowiedź z retry, timeout → `AppError("LLM_UNAVAILABLE", ..., 503)`) oraz ręczny przebieg na formularzach 1 i 5 opisany w `docs/wybor-modelu.md`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
