# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Rozwiązanie zadania COI na HackNation 2026 (drużyna AKAI): API do cyfryzacji formularzy. Zwraca JSON opisujący pola formularza (nazwy, format, dozwolone wartości); pola mogą wskazywać słowniki (zestawy dozwolonych wartości) i inne pola (zależności między polami).

Plan implementacji backendu: `docs/plan-implementacji.md`. Zadania do równoległej pracy agentów, jeden plik na blok: `docs/bloki/` (indeks w `docs/bloki/README.md`). Zakres: tylko backend.

Materiały zadania leżą w `dane_zadania/` (tylko do odczytu). `dane_zadania/blankiety/` zawiera 9 formularzy, każdy w wielu formatach. Formularze 1 i 5 mają oczekiwany JSON (`konfiguracja_form_*.json`) i to on jest wzorcem; tam gdzie przeczy schematowi (np. `repeatingSectionGrid`), wygrywa przykład. Kontrakt wyjściowy to `dane_zadania/materialy/importowanyPlikJsonSchemat (1).json` (JSON Schema `FormDefinition`: `title` → `tabs[]` → `questions[]` z pozycją `x/y/rows/cols` i obiektem `field`). Opis pól jest w `OpisImportowanegoPlikuJSON (1).docx`, reguły walidacji w `Reguły techniczne konfiguracji formularzy...docx`. Zanim zmienisz model danych, sprawdź go z tymi plikami.

Stack: Python 3.14 + FastAPI (menedżer: **uv**), React + Vite (menedżer: **npm**), Docker / Docker Compose.

## Architektura: jeden proces, jedno repo

FastAPI serwuje API i zbudowany frontend:

- Endpointy API są pod prefiksem `/api` i są rejestrowane **przed** montowaniem plików statycznych.
- `vite build` zapisuje do `src/hacknation_2026/static/` (katalog w `.gitignore`). FastAPI montuje go na `/` przez `StaticFiles(directory=..., html=True)`, a ścieżkę liczy względem `Path(__file__)`, więc działa i przy `uv sync` (instalacja editable), i w wheelu/Dockerze.
- Jeśli frontend dostanie routing po stronie klienta, potrzebny jest catch-all zwracający `index.html` dla nieznanych ścieżek spoza `/api`.
- W dev działają dwa procesy: Vite (HMR) z proxy `/api` → `http://127.0.0.1:3000` w `vite.config` oraz uvicorn z `--reload`.
- Docker: wieloetapowy build. Etap Node robi `npm ci && npm run build`, a etap Python kopiuje wynik do `src/hacknation_2026/static/` i robi `uv sync --frozen`.

Struktura:

```
pyproject.toml / uv.lock      # backend, entry point `hacknation-2026` → hacknation_2026:main
src/hacknation_2026/
  __init__.py                 # main(): uruchamia uvicorn (port z $PORT, domyślnie 3000; host z $HOST, domyślnie 127.0.0.1, w Dockerze 0.0.0.0)
  app.py                      # FastAPI(), include_router(api, prefix="/api"), mount static (tylko gdy katalog istnieje)
  api/                        # routery
  models/                     # (do utworzenia) modele Pydantic odpowiadające FormDefinition
  static/                     # output vite build (gitignored)
tests/                        # pytest
frontend/                     # Vite + React (JavaScript), lint: oxlint
Dockerfile
docker-compose.yml
dane_zadania/                 # materiały konkursowe, nie edytować
```

## Komendy

Backend (z katalogu głównego):

```bash
uv sync                                   # instalacja zależności
uv add fastapi uvicorn                    # dodanie zależności (nie edytuj ręcznie dependencies)
uv run hacknation-2026                    # uruchomienie przez entry point
uv run uvicorn hacknation_2026.app:app --reload --port 3000
uv run pytest                             # testy
uv run pytest tests/test_x.py::test_name  # pojedynczy test
```

Frontend (z `frontend/`):

```bash
npm install
npm run dev      # Vite dev server z proxy /api
npm run build    # build do ../src/hacknation_2026/static
npm run lint     # oxlint
```

Całość: `docker compose up --build` (aplikacja na http://localhost:3000).

## Konwencje

- Python jest wcięty **2 spacjami** (tak jak w istniejącym `__init__.py`).
- Nazwa dystrybucji to `cyfryzacja-formularzy`, a moduł importu to `hacknation_2026`. Wiąże je `[tool.uv.build-backend] module-name` w `pyproject.toml`. Bez tego wpisu `uv sync` nie działa.
- Build backend to `uv_build`, układ `src/`.
