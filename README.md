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

## Konfiguracja i uruchomienie lokalne

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

### Docker

```powershell
docker compose up --build
```

Aplikacja będzie dostępna pod `http://localhost:3000`. Przed uruchomieniem skonfiguruj `.env` jak wyżej; Compose używa DeepInfra jako zapasowego modelu przy limicie zapytań.

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
