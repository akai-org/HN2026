# HackNation 2026 - Cyfryzacja Formularzy

Drużyna: **AKAI**

## Opis projektu

Narzędzie udostępniające interfejs REST API oraz aplikację webową pozwalającą na automatyczną cyfryzację formularzy urzędowych (PDF, DOC, DOCX, ODS, XLSX, JPG/JPEG, PNG). Zwraca ustandaryzowaną strukturę w formacie JSON opisującą strony, sekcje i pola formularza, ich typy, walidacje, powiązania ze słownikami oraz dynamiczne zależności między polami.

Analizę treści wykonuje otwartoźródłowy model Gemma 4 31B przez API zgodne z OpenAI (domyślnie EdenAI; działa też z lokalną Ollamą). Przesyłane pliki są przetwarzane wyłącznie w pamięci operacyjnej, a do modelu trafia tylko tekst odczytany z formularza.

## Architektura

```text
plik ─► walidacja ─► tekst z pliku ─► LLM (Gemma) ─► builder ─► kontrola reguł ─► JSON
```

1. **Walidacja pliku** – sprawdzenie nazwy (maks. 250 znaków, brak znaków `; : > < / \ | ' * % $`), limitu rozmiaru oraz zgodności typu MIME z rozszerzeniem.
2. **Ekstrakcja tekstu** – parsery per format (`pdfplumber`, `python-docx`, `olefile`, `openpyxl`, `lxml` dla ODS, Tesseract OCR z językiem polskim dla skanów i obrazów, OpenCV do wykrywania linii, kratek i ramek do wypełnienia).
3. **Analiza LLM** – model językowy (API zgodne z OpenAI `/chat/completions`) przekształca treść blankietu w pośredni model `FormSpec` wymuszony schematem JSON i walidowany przez Pydantic. Gdy w odpowiedzi brakuje dużej części długiego formularza, idzie jedno zapytanie uzupełniające o brakujące strony.
4. **Builder** – deterministyczny generator w Pythonie składa docelowy JSON formularza (sekcje standardowe, UUID, układ 3-kolumnowy, słowniki, dane inicjalne, reguły `states` i `flow`).
5. **Kontrola reguł** – weryfikacja wymagań technicznych wynikowego JSON-a; wykryte niezgodności trafiają do listy ostrzeżeń w odpowiedzi.

## Stack technologiczny

- **Backend:** Python 3.14, FastAPI, Pydantic, `uv`
- **Frontend:** React.js, Vite (serwowany statycznie przez FastAPI)
- **AI / OCR:** Gemma 4 31B (open source) przez EdenAI lub lokalną Ollamę, Tesseract OCR (`pol`), OpenCV
- **Deployment:** Docker, Docker Compose

## Konfiguracja (`.env`)

Aplikacja czyta konfigurację ze zmiennych środowiskowych lub z pliku `.env` w katalogu głównym repozytorium. Plik `.env` jest w `.gitignore` i nie trafia do repozytorium. Utwórz go z szablonu [`.env.example`](.env.example):

```bash
cp .env.example .env
```

| Zmienna | Opis | Wartość domyślna | Wymagana |
|---|---|---|---|
| `MAX_FILE_SIZE_MB` | Maksymalny rozmiar przesyłanego pliku w MB | `10` | Nie |
| `LLM_BASE_URL` | Adres API kompatybilnego z OpenAI: bazowy (`…/v1`) albo pełny endpoint (`…/chat/completions`). Lokalna Ollama: `http://localhost:11434/v1` | `https://api.groq.com/openai/v1` (w `docker-compose.yml`: `https://api.edenai.run/v3`) | Nie |
| `LLM_API_KEY` | Klucz API (dla lokalnej Ollamy dowolna niepusta wartość, np. `ollama`) | brak | Tak |
| `LLM_MODEL` | Nazwa modelu. Dla EdenAI z przypiętym dostawcą, np. `google/gemma-4-31b-it` (bez prefiksu EdenAI wybiera dostawcę sam, a część z nich nie trzyma się schematu odpowiedzi) | brak (w `docker-compose.yml`: `google/gemma-4-31b-it`) | Tak |
| `LLM_FALLBACK_MODEL` | Ten sam model u innego dostawcy, używany od razu, gdy `LLM_MODEL` odpowie HTTP 429 (limit zapytań). Pusty: ponowienia po 5, 15 i 30 s | pusty (w `docker-compose.yml`: `deepinfra/google/gemma-4-31B-it`) | Nie |
| `LLM_TIMEOUT_S` | Limit czasu oczekiwania na odpowiedź modelu w sekundach | `300` | Nie |
| `OCR_LANG` | Kod języka dla Tesseract OCR | `pol` | Nie |
| `EMIT_VALIDATORS` | Czy emitować walidatory pól w wynikowym JSON-ie | `true` | Nie |

## Uruchomienie przez Docker Compose

1. Przygotuj plik `.env`:

```bash
cp .env.example .env
```

   Wpisz w nim `LLM_API_KEY` (klucz EdenAI). Model i adres API mają w `docker-compose.yml` wartości domyślne (EdenAI, Gemma 4 31B przez Google, zapasowo przez DeepInfra), które nadpiszesz zmiennymi w `.env`.

2. Zbuduj obraz i uruchom serwis `app`:

```bash
docker compose up --build
```

Obraz zawiera Tesseract z językiem polskim i zbudowany frontend. Kontener działa jako użytkownik bez uprawnień roota, a port 3000 jest wystawiony tylko na `127.0.0.1`.

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

Wymagania: Python 3.14+, `uv`, `tesseract-ocr` z pakietem `tesseract-ocr-pol` oraz klucz do API zgodnego z OpenAI w `.env` (EdenAI albo lokalna Ollama).

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
- 429: natychmiastowe przejście na `LLM_FALLBACK_MODEL`, a bez niego ponowienia po 5, 15 i 30 s,
- timeout, brak połączenia, 5xx i 429 po ponowieniach: błąd `LLM_UNAVAILABLE` (503); zły klucz: błąd `LLM_CONFIG`,
- długi formularz z dużą luką w odpowiedzi: jedno zapytanie uzupełniające, a przy jego błędzie zostaje pierwsza odpowiedź,
- pusty dokument: błąd `EMPTY_DOCUMENT`, bez wywołania LLM.

### Ręczny test analizy LLM na prawdziwym modelu

Samą analizę LLM, bez budowy formularza, sprawdzisz, wywołując `analyze()` bezpośrednio. Uzupełnij `.env` (klucz i model) i uruchom polecenie **z katalogu głównego repozytorium** (tam leży `.env`). Teksty formularzy do testów leżą w katalogu głównym: `formularz.txt` (formularz 5, nadpłata podatku) i `formularz_1.txt` (formularz 1, numer porządkowy). Własny formularz przetestujesz, wklejając tekst z blankietu `.docx` albo `.pdf` do pliku i podając jego nazwę zamiast `formularz.txt`.

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
uv run hacknation-2026          # http://localhost:3000, sprawdzenie: GET /api/health
docker compose up --build       # http://localhost:3000
```

`POST /api/forms/convert` (plik w polu `file`) zwraca `form` (gotowy JSON formularza zgodny z `FormDefinition`), `warnings` (naruszenia reguł technicznych z kontroli reguł, jako tekst „komunikat (ścieżka)”) oraz `proposed_dictionaries`, czyli propozycje nowych słowników z nazwą, przykładowymi wartościami i polami, które by ich używały.
