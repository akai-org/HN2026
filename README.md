# Cyfryzacja formularzy — HackNation 2026

Projekt drużyny **AKAI**. Aplikacja analizuje formularze urzędowe i generuje JSON ze strukturą `FormDefinition`: strony, sekcje, pola, walidacje, słowniki, zależności i przepływ między stronami.

## Funkcje

- Import plików PDF, DOC/DOCX, ODS, XLSX, JPG/JPEG i PNG.
- Walidacja nazwy, rozmiaru oraz zgodności rozszerzenia z formatem pliku.
- Ekstrakcja tekstu i pól z dokumentów; OCR Tesseract z językiem polskim dla skanów i obrazów.
- Analiza treści przez model zgodny z OpenAI Chat Completions, budowa formularza oraz kontrola reguł technicznych.
- Podgląd oryginału, formularza i JSON-u; możliwość edycji fragmentu JSON-u i pobrania wyniku.
- Ostrzeżenia o naruszeniach reguł i propozycje nowych słowników.

## Wdrożenie

Aplikacja jest dostępna pod adresem [hacknation.zakhil.dev](https://hacknation.zakhil.dev).

Dostęp chroni HTTP Basic Auth. Dane logowania:
- login: hacknation2026
- hasło: 2026hacknation

Wdrożenie działa w Dockerze za Nginx i korzysta z Eden AI (`google/gemma-4-31b-it`).

## Wymagania

- Python 3.14+, [`uv`](https://docs.astral.sh/uv/)
- Node.js 24+ i npm do uruchomienia lub zbudowania frontendu
- Tesseract OCR z pakietem języka polskiego (`pol`)
- Klucz API Eden AI

Opis architektury: [docs/architektura.md](docs/architektura.md).

## Konfiguracja

Aplikacja czyta konfigurację ze zmiennych środowiskowych albo z pliku `.env` w katalogu, z którego jest uruchamiana. Wzór
z opisami: [.env.example](.env.example). Sekrety (klucz API) podaje się dopiero przy uruchomieniu; nie trafiają do obrazu
Docker.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `LLM_API_KEY` | brak, wymagana | Klucz API modelu językowego |
| `LLM_MODEL` | brak, wymagana | Nazwa modelu, np. `google/gemma-4-31b-it` (w Eden AI z prefiksem dostawcy) |
| `LLM_BASE_URL` | `https://api.edenai.run/v3` | Adres API zgodnego z OpenAI Chat Completions; może być serwer lokalny (vLLM, llama.cpp, Ollama) |
| `LLM_FALLBACK_MODEL` | pusta | Model używany, gdy `LLM_MODEL` odpowie HTTP 429 (limit zapytań); pusta = bez zapasowego |
| `LLM_TIMEOUT_S` | `300` | Limit czasu odpowiedzi modelu w sekundach |
| `MAX_FILE_SIZE_MB` | `10` | Maksymalny rozmiar przesyłanego pliku w MB. Frontend sprawdza też własny limit 10 MB przed wysłaniem (`frontend/src/lib/uploads.js`) |
| `OCR_LANG` | `pol` | Język OCR Tesseract dla skanów i obrazów |
| `EMIT_VALIDATORS` | `true` | Czy dodawać walidatory pól (`PESEL`, `NIP`, `ZIP_CODE`, `EMAIL`…) do wynikowego JSON-u |
| `HOST` | `127.0.0.1` (w obrazie Docker `0.0.0.0`) | Adres, na którym nasłuchuje serwer |
| `PORT` | `3000` | Port serwera |

## Uruchomienie lokalne

Uruchamiaj polecenia z katalogu głównego repozytorium. Skopiuj konfigurację i ustaw w `.env` adres API, klucz i model:

```powershell
Copy-Item .env.example .env
```

```dotenv
LLM_BASE_URL=https://api.edenai.run/v3
LLM_API_KEY=<klucz-Eden-AI>
LLM_MODEL=google/gemma-4-31b-it
```

Uruchom backend:

```powershell
uv sync
uv run hacknation-2026
```

W drugim terminalu uruchom frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Otwórz adres podany przez Vite (zwykle `http://localhost:5173`); Vite przekazuje `/api` do backendu pod `http://127.0.0.1:3000`.

## Docker

Obraz zawiera backend, zbudowany frontend i Tesseract z językiem polskim. Proces działa jako nieuprzywilejowany użytkownik
`appuser` i nasłuchuje tylko na porcie 3000.

Zbudowanie obrazu:

```powershell
docker build -t cyfryzacja-formularzy:1.0.0 .
```

Uruchomienie (konfiguracja z `.env`, jak wyżej):

```powershell
docker run --rm --env-file .env -p 127.0.0.1:3000:3000 cyfryzacja-formularzy:1.0.0
```

Pojedyncze zmienne można też podać przez `-e`, np. `-e MAX_FILE_SIZE_MB=20`.

Albo jednym poleceniem przez Docker Compose (buduje i uruchamia):

```powershell
docker compose up --build
```

Aplikacja będzie dostępna pod `http://localhost:3000`. Compose ustawia Eden AI z modelem `google/gemma-4-31b-it` i DeepInfra
jako zapasowego dostawcę przy limicie zapytań; zmienne z `.env` mają pierwszeństwo.

## API

Dokumentacja interaktywna: `http://localhost:3000/docs`.

### `GET /api/health`

Zwraca `status: "ok"` oraz `llm: "ok"` albo `"unavailable"` (sprawdzenie połączenia z modelem):

```json
{"status": "ok", "llm": "ok"}
```

### `POST /api/forms/extract`

Przyjmuje plik w polu `file` (`multipart/form-data`) i zwraca `format` oraz `blocks` (odczytany tekst, tabele i pola wyboru). Nie wywołuje modelu.

### `POST /api/forms/convert`

Przyjmuje plik w polu `file` (`multipart/form-data`) i zwraca `form` (`FormDefinition`), `warnings` (naruszenia reguł) oraz `proposed_dictionaries` (propozycje słowników). Błędy przetwarzania aplikacji zawierają `code` i `message`.

Oba endpointy plikowe obsługują `.pdf`, `.doc`, `.docx`, `.ods`, `.xlsx`, `.jpg`, `.jpeg`, `.png`; sprawdzają nazwę, rozmiar (domyślnie 10 MB, `MAX_FILE_SIZE_MB`) i zgodność zawartości z rozszerzeniem.

## Testy

```powershell
uv run pytest
```

Testy LLM korzystają z zamockowanych odpowiedzi i nie wymagają połączenia z modelem:

```powershell
uv run pytest tests/ai/
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

## Wynikowe pliki JSON

Katalog [wyniki/](wyniki/) zawiera wynik `POST /api/forms/convert` dla każdego blankietu z `dane_zadania/blankiety/`
(9 formularzy, każdy w kilku formatach): `wyniki/<formularz>/<plik>.json` z polami `form` (JSON do importu),
`warnings` i `proposed_dictionaries`. `wyniki/raport.json` podsumowuje przebieg: liczbę pól, naruszenia reguł, czas
przetwarzania, zgodność pól między formatami tego samego formularza i podobieństwo do przykładów dla formularzy 1 i 5.

Ponowne wygenerowanie (wymaga skonfigurowanego modelu w `.env`):

```powershell
uv run python scripts/evaluate.py --out wyniki
```

Pliki graficzne wymagają Tesseract. Bez lokalnej instalacji skrypt można uruchomić w obrazie Docker (bash):

```bash
docker run --rm --env-file .env --user "$(id -u):$(id -g)" \
  -v "$PWD/scripts:/app/scripts:ro" -v "$PWD/dane_zadania:/app/dane_zadania:ro" -v "$PWD/wyniki:/app/wyniki" \
  cyfryzacja-formularzy:1.0.0 /app/.venv/bin/python scripts/evaluate.py --out wyniki
```

## Licencja

[MIT](LICENSE). Licencje zależności opisuje [docs/architektura.md](docs/architektura.md#zależności-i-licencje).
