# Cyfryzacja formularzy — HackNation 2026

Projekt drużyny **AKAI**. REST API przyjmuje blankiet formularza (PDF, DOC/DOCX, ODS, XLSX, JPG/JPEG, PNG) i zwraca JSON
z konfiguracją formularza gotową do importu: strony, sekcje, pola, walidacje, słowniki, dane inicjalne i zależności.

- Architektura i realizacja wymagań: [docs/architektura.md](docs/architektura.md)
- Wynikowe pliki JSON dla 9 formularzy: [wyniki/](wyniki/)
- Demo: [hacknation.zakhil.dev](https://hacknation.zakhil.dev) (login `hacknation2026`, hasło `2026hacknation`)

## Konfiguracja

Zmienne środowiskowe albo plik `.env` (wzór: [.env.example](.env.example)). Sekrety podaje się dopiero przy uruchomieniu;
`.env` nie trafia do obrazu Docker.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `MAX_FILE_SIZE_MB` | `10` | Maksymalny rozmiar przesyłanego pliku w MB |
| `LLM_API_KEY` | wymagana | Klucz API modelu językowego |
| `LLM_MODEL` | wymagana | Nazwa modelu, np. `google/gemma-4-31b-it` |
| `LLM_BASE_URL` | `https://api.edenai.run/v3` | Adres API zgodnego z OpenAI Chat Completions |
| `LLM_FALLBACK_MODEL` | pusta | Zapasowy model przy limicie zapytań (HTTP 429) |
| `LLM_TIMEOUT_S` | `300` | Limit czasu odpowiedzi modelu w sekundach |
| `OCR_LANG` | `pol` | Język OCR dla skanów i obrazów |
| `EMIT_VALIDATORS` | `true` | Czy dodawać walidatory pól do wynikowego JSON-u |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | Adres i port serwera (w obrazie Docker `HOST=0.0.0.0`) |

## Budowanie obrazu Docker

```bash
docker build -t cyfryzacja-formularzy:1.0.0 .
```

## Uruchomienie

```bash
cp .env.example .env        # uzupełnij LLM_API_KEY
docker run --rm --env-file .env -p 127.0.0.1:3000:3000 cyfryzacja-formularzy:1.0.0
```

Albo przez Docker Compose: `docker compose up --build`. Aplikacja: `http://localhost:3000`, dokumentacja API:
`http://localhost:3000/docs`.

Bez Dockera (Python 3.14, [uv](https://docs.astral.sh/uv/), Node.js 24, Tesseract z językiem `pol`):

```bash
uv sync && uv run hacknation-2026                 # backend na :3000
cd frontend && npm ci && npm run dev              # frontend (Vite) z proxy /api
```

## REST API

| Metoda i ścieżka | Wejście | Wyjście |
|---|---|---|
| `POST /api/forms/convert` | `multipart/form-data`, plik w polu `file` | `form` (JSON do importu), `warnings`, `proposed_dictionaries` |
| `POST /api/forms/extract` | jak wyżej | tekst odczytany z pliku, bez modelu językowego |
| `GET /api/health` | — | `{"status": "ok", "llm": "ok" \| "unavailable"}` |

```bash
curl -F "file=@wniosek.pdf" http://localhost:3000/api/forms/convert
```

```json
{
  "form": {"title": "Wniosek o …", "tabs": [ … ], "flow": {"links": [ … ]}},
  "warnings": [],
  "proposed_dictionaries": [{"name": "…", "values_example": [ … ], "used_by": [ … ]}]
}
```

- `form` ma strukturę `importowanyPlikJsonSchemat`.
- `warnings` to naruszenia Reguł technicznych, jeśli są.
- `proposed_dictionaries` to propozycje nowych słowników.

Błędy zwracają `{"code": "...", "message": "..."}`:

| HTTP | Kod | Przyczyna |
|---|---|---|
| 413 | `FILE_TOO_LARGE` | Plik większy niż `MAX_FILE_SIZE_MB` |
| 415 | `UNSUPPORTED_FORMAT` | Rozszerzenie spoza listy obsługiwanych |
| 415 | `MIME_MISMATCH` | Zawartość pliku nie odpowiada rozszerzeniu |
| 422 | `INVALID_FILENAME` | Nazwa pusta, dłuższa niż 250 znaków albo zawiera `; : > < / \ \| ' * % $` |
| 422 | `UNREADABLE_FILE`, `EMPTY_DOCUMENT` | Uszkodzony plik albo brak tekstu do odczytania |
| 422 | `NOT_A_FORM` | Dokument nie jest formularzem do wypełnienia |
| 502, 503 | `LLM_*` | Model niedostępny albo zwrócił niepoprawną odpowiedź |

## Wynikowe pliki JSON

`wyniki/<formularz>/<plik>.json` to odpowiedź `POST /api/forms/convert` dla każdego blankietu z `dane_zadania/blankiety/`.
Podsumowanie (liczba pól, naruszenia reguł, czas, zgodność między formatami) jest w `wyniki/raport.json`. Wyniki generuje
`uv run python scripts/evaluate.py`.

## Licencja

[MIT](LICENSE)
