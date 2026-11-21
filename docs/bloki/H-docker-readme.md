# Blok H – Docker, compose, README

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

## Zadanie

**Pliki:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `README.md`

**Wymagania:**
- Obrazy z przypiętymi wersjami (bez `latest`), użytkownik bez uprawnień roota, w obrazie `tesseract-ocr` z `tesseract-ocr-pol` (OpenCV jest z PyPI jako `opencv-python-headless`, bez bibliotek systemowych X11) (i ewentualnie to, czego wymaga blok B2).
- Aplikacja na porcie **3000** (`HOST=0.0.0.0`, `PORT=3000` już są w Dockerfile).
- `docker-compose.yml`: serwis `app` (port 3000, `env_file: .env`) i serwis `ollama` z przypiętą wersją, wolumenem na modele i portem tylko w sieci compose, `LLM_BASE_URL=http://ollama:11434`. Model pobierany przy starcie (entrypoint z `ollama pull`).
- README (wymóg zadania): build obrazu, uruchomienie, opis konfiguracji (tabela zmiennych z `Settings`), opis REST API z przykładami `curl`, skrót architektury (diagram pipeline'u z `plan-implementacji.md`).

**Gotowe, gdy:** `docker compose up --build` startuje oba serwisy, a `curl localhost:3000/api/health` zwraca `ok`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
