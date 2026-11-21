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
  - `applicant_data: true` tylko dla własnych danych osobowych wnioskodawcy, które zostają w `pages` (np. data urodzenia, obywatelstwo, adres zameldowania); blok E zasila je danymi inicjalnymi,
  - grupowanie pól merytorycznych w tematyczne strony i sekcje,
  - warunki `show_if` dla pól zależnych.
- Wybór modelu: przetestuj 2–3 modele (np. Bielik 11B v2, Qwen2.5 7B/14B Instruct; licencje Apache 2.0) na tekstach formularzy 1 i 5. Kryterium to porównanie z merytorycznymi stronami wzorców (np. „Informacje o nadpłacie”). Wynik zapisz w `docs/wybor-modelu.md`.
- Few-shot **nie** może zawierać treści blankietów z danych (zakaz treści formularzy w kodzie). Jeśli potrzebny, użyj wymyślonego, krótkiego formularza.

**Gotowe, gdy:** testy jednostkowe z zamockowanym HTTP (poprawna odpowiedź, zła odpowiedź z retry, timeout → `AppError("LLM_UNAVAILABLE", ..., 503)`) oraz ręczny przebieg na formularzach 1 i 5 opisany w `docs/wybor-modelu.md`.

## Stan implementacji

> **Status:** kod i testy jednostkowe są gotowe. Do zrobienia zostało porównanie modeli i `docs/wybor-modelu.md`. Szczegóły w punkcie „Co zostało”.

### Jak to działa

```
ExtractedDocument ─► analyze()
                       │ 1. pusty tekst? → AppError EMPTY_DOCUMENT (422), bez wywołania LLM
                       │ 2. build_messages(): prompt systemowy + przykład (few-shot) + tekst formularza
                       │ 3. chat(): POST {LLM_BASE_URL}/chat/completions, temperature=0,
                       │    response_format = schemat FormSpec
                       │ 4. FormSpec.model_validate_json(odpowiedź)  (usuwa ewentualne ```json … ```)
                       │ 5. błąd walidacji → dopisuje do rozmowy odpowiedź modelu i listę błędów, próbuje ponownie (raz)
                       ▼
                    FormSpec  (albo AppError LLM_INVALID_RESPONSE po 2 nieudanych próbach)
```

### Zmiana względem wymagań: API zgodne z OpenAI zamiast natywnej Ollamy

Zamiast `POST /api/chat` Ollamy klient używa endpointu `POST {LLM_BASE_URL}/chat/completions` (format OpenAI). Ten sam kod działa więc z:
- **Groq** (obecnie używany): `LLM_BASE_URL=https://api.groq.com/openai/v1`,
- **lokalną Ollamą**: `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL` z `ollama list`, dowolny `LLM_API_KEY`.

Zamiast pola `format` Ollamy schemat `FormSpec` idzie w `response_format: {"type": "json_schema", ...}`.

**Uwaga:** Groq to zewnętrzne API, a zasady wspólne go zabraniają. Przed oddaniem rozwiązania przełącz `.env` na lokalną Ollamę albo uzgodnij to w drużynie.

### Pliki

| Plik | Co robi |
|---|---|
| `src/hacknation_2026/ai/__init__.py` | Eksportuje `analyze`. Inne bloki importują `from hacknation_2026.ai import analyze`. |
| `src/hacknation_2026/ai/analyze.py` | `analyze(doc, settings) -> FormSpec`. Sprawdza pusty dokument, składa wiadomości, woła `chat()`, waliduje wynik przez `FormSpec.model_validate_json` i przy błędzie ponawia (`MAX_ATTEMPTS = 2`), dopisując do rozmowy komunikat z `retry_prompt()`. |
| `src/hacknation_2026/ai/client.py` | `chat(messages, settings, schema) -> str`, czyli jedno wywołanie HTTP (`httpx`) z nagłówkiem `Authorization: Bearer {LLM_API_KEY}`, modelem `LLM_MODEL` i timeoutem `LLM_TIMEOUT_S`. Gdy model nie obsługuje `json_schema` (HTTP 400 o `response_format`), raz przełącza się na `{"type": "json_object"}`. Mapuje błędy HTTP na `AppError` (tabela niżej). `_make_client()` jest osobną funkcją, żeby testy mogły podmienić transport. |
| `src/hacknation_2026/ai/prompt.py` | Treść promptu po polsku (`SYSTEM_PROMPT`): opis pól `FormSpec`, lista sekcji do **pominięcia** (dane wnioskodawcy, adres, kontakt, pełnomocnik, zgody, podpis, adnotacje urzędu), zasady stron i sekcji, typy pól (RADIO do 5 opcji, SELECT powyżej 5, zgody nigdy jako CHECKBOX, załączniki jako FILE_UPLOADER…) i `show_if`. Na końcu doklejony JSON Schema `FormSpec`. Few-shot (`EXAMPLE_INPUT`/`EXAMPLE_OUTPUT`) to **wymyślony** wniosek o usunięcie drzewa, bez treści blankietów z `dane_zadania/`. `retry_prompt()` formatuje błędy walidacji Pydantic (maks. 20) do ponownej próby. |
| `tests/ai/test_analyze.py` | 13 testów z zamockowanym HTTP (`httpx.MockTransport` podstawiony przez `monkeypatch` na `client._make_client`). Bez klucza i bez sieci. |

### Błędy (`AppError`)

| Kod | HTTP | Kiedy |
|---|---|---|
| `EMPTY_DOCUMENT` | 422 | Dokument bez tekstu. LLM nie jest wołany. |
| `LLM_UNAVAILABLE` | 503 | Timeout, brak połączenia, HTTP 429 (limit zapytań), HTTP 5xx. |
| `LLM_CONFIG` | 500 | HTTP 401/403, czyli zły lub brakujący `LLM_API_KEY`. |
| `LLM_ERROR` | 502 | Inny błąd 4xx albo odpowiedź w nieoczekiwanym formacie. |
| `LLM_INVALID_RESPONSE` | 502 | Po 2 próbach odpowiedź nadal nie przechodzi walidacji `FormSpec`. |

Odpowiedź Groq 400 `json_validate_failed` (model wygenerował niepoprawny JSON) nie jest błędem końcowym. Liczy się jako nieudana próba i uruchamia ponowienie.

### Konfiguracja (`.env`, szablon w `.env.example`)

| Zmienna | Wymagana | Domyślnie |
|---|---|---|
| `LLM_API_KEY` | **tak** (tylko w `.env`) | – |
| `LLM_MODEL` | **tak** (tylko w `.env`) | – |
| `LLM_BASE_URL` | nie | `https://api.groq.com/openai/v1` |
| `LLM_TIMEOUT_S` | nie | `300` |

Żeby dodać `llm_api_key` i usunąć domyślny `llm_model`, trzeba było zmienić pliki bloku 0: `config.py`, `tests/contracts/test_contracts.py` i `00-kontrakty.md`. Zmienił się też `docker-compose.yml` bloku H (`env_file: .env`).

### Testy

```bash
uv run pytest tests/ai/ -v
```

Pokrycie testów:
- poprawna odpowiedź (sprawdza URL, klucz, model, `temperature=0` i schemat w żądaniu),
- usuwanie ```json,
- retry z błędem walidacji w drugim żądaniu,
- błąd po dwóch złych odpowiedziach,
- retry po `json_validate_failed`,
- przejście na `json_object`,
- timeout, brak połączenia, 429/500/503,
- zły klucz,
- pusty dokument.

Ręczny test na prawdziwym modelu opisuje `README.md` (sekcja „Testowanie”).

### Co zostało

- `uv add httpx`. Obecnie `httpx` jest tylko w grupie `dev`, a `client.py` potrzebuje go w runtime.
- Porównanie 2–3 modeli na formularzach 1 i 5 i wynik w `docs/wybor-modelu.md`. Potem wybrany model trzeba wpisać do `LLM_MODEL` w `.env.example`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
