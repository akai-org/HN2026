# Do poprawy

Znalezione podczas przeglądu zgodności z wymaganiami (2026-11-22).

## Frontend: odświeżenie podstrony daje 404

Frontend ma routing po stronie klienta (`/digitalize`, `/verify` w `frontend/src/main.jsx`), a FastAPI montuje
`StaticFiles(html=True)`, który zwraca `index.html` tylko dla `/`. Bezpośrednie wejście albo odświeżenie
`/verify` czy `/digitalize` kończy się 404.

Poprawka: catch-all w `src/hacknation_2026/app.py`, który dla nieznanych ścieżek spoza `/api` zwraca `index.html`
(zob. CLAUDE.md, sekcja „Architektura”).

## Dokumentacja i konfiguracja: niespójności

- `.env.example` twierdzi, że `docker-compose.yml` nadpisuje `LLM_BASE_URL` na `http://ollama:11434/v1`, a compose
  ustawia EdenAI (`https://api.edenai.run/v3`).
- Domyślne `llm_base_url` w `src/hacknation_2026/config.py` to Groq, inne niż w `.env.example` (Ollama)
  i w compose (EdenAI).
- README („Ręczny test analizy LLM”) odsyła do `formularz.txt` i `formularz_1.txt` w katalogu głównym, a tych plików
  nie ma w repozytorium.
- Brak pliku `LICENSE` (zadanie wymaga licencji open source bez copyleftu).
