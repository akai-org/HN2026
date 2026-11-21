# HackNation 2026 - Cyfryzacja Formularzy

Drużyna: **AKAI**

## Opis projektu

Narzędzie udostępniające interfejs API pozwalający na cyfryzowanie formularzy. Zwraca unstandaryzowaną strukturę w formacie JSON opisującą pola formularza, ich nazwy, format i dozwolone wartości. Pola mogą być powiązane ze słownikami (zestawy dozwolonych wartości) oraz innymi polami, co pozwala na obsługę skomplikowanych relacji między polami.

## Stack technologiczny

Backend: Python 3.14, FastAPI
Frontend: React.js, Vite
Deployment: Docker, Docker Compose

## Konfiguracja (`.env`)

Aplikacja czyta konfigurację ze zmiennych środowiskowych albo z pliku `.env` w katalogu głównym repozytorium. Plik `.env` jest w `.gitignore`, więc **nie trafia do repozytorium**. Każdy tworzy go u siebie z szablonu [`.env.example`](.env.example):

```bash
cp .env.example .env
# uzupełnij LLM_API_KEY, LLM_MODEL i JWT_SECRET
```

- `LLM_API_KEY` i `LLM_MODEL` ustawia się **tylko** w `.env`, bo kod nie ma dla nich wartości domyślnych. Bez nich aplikacja nie wystartuje i zgłosi brakującą zmienną.
- Klucz do Groq generuje się na https://console.groq.com/keys. Model zmienia się samym `LLM_MODEL`, bez zmian w kodzie. Lista modeli jest na https://console.groq.com/docs/models.
- Żeby użyć lokalnej Ollamy zamiast Groq, ustaw `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL` na nazwę modelu z `ollama list` i dowolną wartość `LLM_API_KEY`.
- `docker compose` wczytuje ten sam plik (`env_file: .env`).

## Testowanie

### Testy automatyczne

```bash
uv sync
uv run pytest                  # wszystkie testy
uv run pytest tests/ai/        # tylko analiza LLM (blok C)
uv run pytest tests/ai/test_analyze.py::test_invalid_response_is_retried_with_error
```

Testy w `tests/ai/` nie łączą się z żadnym API. HTTP jest zamockowany (`httpx.MockTransport`), więc nie potrzebują klucza ani internetu. Sprawdzają:

- poprawną odpowiedź: wynik to `FormSpec`, a żądanie ma `temperature=0`, schemat `FormSpec`, model i klucz z ustawień,
- niepoprawną odpowiedź: jedna ponowna próba z dopisanym błędem walidacji, po drugiej porażce błąd `LLM_INVALID_RESPONSE` (502),
- przejście na zwykły tryb JSON, gdy model nie obsługuje `json_schema`,
- timeout, brak połączenia, 429 i 5xx: błąd `LLM_UNAVAILABLE` (503); zły klucz: błąd `LLM_CONFIG`,
- pusty dokument: błąd `EMPTY_DOCUMENT`, bez wywołania LLM.

### Ręczny test analizy LLM na prawdziwym modelu

Endpoint konwersji powstaje w bloku G. Do tego czasu `analyze()` wywołuje się bezpośrednio. Uzupełnij `.env` (klucz i model) i uruchom polecenie **z katalogu głównego repozytorium** (tam leży `.env`). Teksty formularzy do testów leżą w katalogu głównym: `formularz.txt` (formularz 5, nadpłata podatku) i `formularz_1.txt` (formularz 1, numer porządkowy). Własny formularz przetestujesz, wklejając tekst z blankietu `.docx` albo `.pdf` do pliku i podając jego nazwę zamiast `formularz.txt`.

```bash
uv run python - formularz.txt <<'EOF'
import sys
from hacknation_2026.ai import analyze
from hacknation_2026.config import get_settings
from hacknation_2026.contracts import Block, ExtractedDocument, FileFormat

text = open(sys.argv[1], encoding="utf-8").read()
doc = ExtractedDocument(format=FileFormat.DOCX, blocks=[Block(kind="text", text=text)])
print(analyze(doc, get_settings()).model_dump_json(indent=2))
EOF
```

Wynik to `FormSpec`: tytuł, urząd, flagi (`allows_other_person`, `allows_legal_entity`, `allows_proxy`), zgody i strony z polami merytorycznymi. Porównaj go ze stronami merytorycznymi wzorców, np. „Informacje o nadpłacie” w `dane_zadania/blankiety/5.*/konfiguracja_form_*.json`. W wyniku **nie powinno** być danych wnioskodawcy, adresu, kontaktu, zgód ani podpisu, bo te sekcje dokłada builder (blok D). Inny model sprawdzisz, zmieniając `LLM_MODEL` w `.env`.

### Aplikacja

```bash
uv run hacknation-2026          # http://localhost:8000, sprawdzenie: GET /api/health
docker compose up --build       # http://localhost:3000
```
