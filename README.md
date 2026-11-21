# HackNation 2026 - Cyfryzacja Formularzy

Drużyna: **AKAI**

## Opis projektu

Narzędzie udostępniające interfejs REST API oraz aplikację webową pozwalającą na automatyczną cyfryzację formularzy urzędowych (PDF, DOC, DOCX, ODS, XLSX, JPG/JPEG, PNG). Zwraca ustandaryzowaną strukturę w formacie JSON opisującą strony, sekcje i pola formularza, ich typy, walidacje, powiązania ze słownikami oraz dynamiczne zależności między polami.

Całe przetwarzanie AI działa lokalnie (Ollama), a przesyłane pliki są przetwarzane wyłącznie w pamięci operacyjnej.

## Architektura

```text
plik ─► walidacja ─► tekst z pliku ─► lokalny LLM ─► builder ─► kontrola reguł ─► JSON
```

1. **Walidacja pliku** – sprawdzenie nazwy (maks. 250 znaków, brak znaków `; : > < / \ | ' * % $`), limitu rozmiaru oraz zgodności typu MIME z rozszerzeniem.
2. **Ekstrakcja tekstu** – parsery per format (`pdfplumber`, `python-docx`, `olefile`, `openpyxl`, `odfpy`, Tesseract OCR z językiem polskim dla skanów i obrazów).
3. **Analiza LLM** – lokalny model w Ollamie (API zgodne z OpenAI `/v1/chat/completions`) przekształca treść blankietu w pośredni model `FormSpec` wymuszony schematem JSON i walidowany przez Pydantic.
4. **Builder** – deterministyczny generator w Pythonie składa docelowy JSON formularza (sekcje standardowe, UUID, układ 3-kolumnowy, słowniki, dane inicjalne, reguły `states` i `flow`).
5. **Kontrola reguł** – weryfikacja wymagań technicznych wynikowego JSON-a; wykryte niezgodności trafiają do listy ostrzeżeń w odpowiedzi.

## Stack technologiczny

- **Backend:** Python 3.14, FastAPI, Pydantic, `uv`
- **Frontend:** React.js, Vite (serwowany statycznie przez FastAPI)
- **AI / OCR:** Ollama (lokalne modele LLM), Tesseract OCR (`pol`)
- **Deployment:** Docker, Docker Compose

## Konfiguracja (`.env`)

Aplikacja czyta konfigurację ze zmiennych środowiskowych lub z pliku `.env` w katalogu głównym repozytorium. Plik `.env` jest w `.gitignore` i nie trafia do repozytorium. Utwórz go z szablonu [`.env.example`](.env.example):

```bash
cp .env.example .env
```

| Zmienna | Opis | Wartość domyślna | Wymagana |
|---|---|---|---|
| `MAX_FILE_SIZE_MB` | Maksymalny rozmiar przesyłanego pliku w MB | `10` | Nie |
| `LLM_BASE_URL` | Adres API kompatybilnego z OpenAI (`/chat/completions`). W `docker-compose.yml` nadpisywane na `http://ollama:11434/v1` | `https://api.groq.com/openai/v1` | Nie |
| `LLM_API_KEY` | Klucz API (dla lokalnej Ollamy dowolna niepusta wartość, np. `ollama`) | brak | Tak |
| `LLM_MODEL` | Nazwa modelu językowego (np. z `ollama list`) | brak | Tak |
| `LLM_TIMEOUT_S` | Limit czasu oczekiwania na odpowiedź modelu w sekundach | `300` | Nie |
| `OCR_LANG` | Kod języka dla Tesseract OCR | `pol` | Nie |
| `EMIT_VALIDATORS` | Czy emitować walidatory pól w wynikowym JSON-ie | `true` | Nie |

## Uruchomienie przez Docker Compose

1. Przygotuj plik `.env`:

```bash
cp .env.example .env
```

2. Zbuduj obraz i uruchom serwisy (`app` oraz `ollama`):

```bash
docker compose up --build
```

Przy pierwszym uruchomieniu kontener `ollama` automatycznie pobierze model z `LLM_MODEL` i zapisze go w wolumenie `ollama_data`.

3. Sprawdź działanie usługi:

```bash
curl -s http://localhost:3000/api/health
```

Aplikacja (wraz z frontendem i dokumentacją OpenAPI pod `/docs`) działa pod adresem `http://localhost:3000`.

## Budowanie samego obrazu Docker

```bash
docker build -t cyfryzacja-formularzy:1.0.0 .
```

Uruchomienie zbudowanego kontenera z własnym plikiem `.env`:

```bash
docker run --rm -p 3000:3000 --env-file .env cyfryzacja-formularzy:1.0.0
```

## Uruchomienie lokalne (bez Dockera)

Wymagania: Python 3.14+, `uv`, `tesseract-ocr` z pakietem `tesseract-ocr-pol` oraz działająca lokalnie Ollama (lub inne API zgodne z OpenAI w `.env` do celów deweloperskich).

```bash
cp .env.example .env
uv sync
uv run hacknation-2026          # [http://127.0.0.1:3000](http://127.0.0.1:3000)
```

## REST API

Interaktywna dokumentacja OpenAPI jest dostępna pod adresem `http://localhost:3000/docs`.

### `GET /api/health`

Zwraca stan aplikacji oraz połączenia z lokalnym LLM.

```bash
curl -s http://localhost:3000/api/health
```

Przykładowa odpowiedź (`200 OK`):

```json
{
  "status": "ok",
  "llm": "ok"
}
```

### `POST /api/forms/convert`

Przyjmuje pojedynczy plik formularza (`multipart/form-data`, pole `file`) i zwraca obiekt `ConvertResult` z konfiguracją formularza (`form`) oraz listą ostrzeżeń (`warnings`).

Obsługiwane formaty: `.pdf`, `.doc`, `.docx`, `.ods`, `.xlsx`, `.jpg`, `.jpeg`, `.png`.

```bash
curl -X POST http://localhost:3000/api/forms/convert \
  -F "file=@sciezka/do/formularza.pdf"
```

Przykładowa odpowiedź (`200 OK`):

```json
{
  "form": {
    "...": "konfiguracja formularza gotowa do importu"
  },
  "warnings": []
}
```

W przypadku błędu walidacji lub przetwarzania API zwraca komunikat błędu w formacie JSON:

```json
{
  "code": "INVALID_FILE_TYPE",
  "message": "Opis błędu"
}
```

## Testowanie

### Testy automatyczne

```bash
uv sync
uv run pytest                  # wszystkie testy
uv run pytest tests/ai/        # tylko analiza LLM (blok C)
uv run pytest tests/ai/test_analyze.py::test_invalid_response_is_retried_with_error
```

Testy w `tests/ai/` nie łączą się z żadnym API. HTTP jest zamockowany (`httpx.MockTransport`), więc nie wymagają klucza ani dostępu do sieci. Sprawdzają:

- poprawną odpowiedź: wynik to `FormSpec`, a żądanie ma `temperature=0`, schemat `FormSpec`, model i klucz z ustawień,
- niepoprawną odpowiedź: jedna ponowna próba z dopisanym błędem walidacji, po drugiej porażce błąd `LLM_INVALID_RESPONSE` (502),
- przejście na zwykły tryb JSON, gdy model nie obsługuje `json_schema`,
- timeout, brak połączenia, 429 i 5xx: błąd `LLM_UNAVAILABLE` (503); zły klucz: błąd `LLM_CONFIG`,
- pusty dokument: błąd `EMPTY_DOCUMENT`, bez wywołania LLM.

### Ręczny test analizy LLM na prawdziwym modelu

Uzupełnij `.env` i uruchom polecenie **z katalogu głównego repozytorium**:

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

Wynik to `FormSpec`: tytuł, urząd, flagi (`allows_other_person`, `allows_legal_entity`, `allows_proxy`), zgody i strony z polami merytorycznymi. Sekcje standardowe (dane wnioskodawcy, adres, kontakt, zgody, strona końcowa) dokłada builder (blok D).