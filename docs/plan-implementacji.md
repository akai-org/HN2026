# Plan implementacji backendu – Cyfryzacja formularzy

Źródła: `dane_zadania/COI - Pełna treść zadania konkursowego.pdf`, `dane_zadania/Reguły techniczne...pdf` (ta sama treść co DOCX w `materialy/`), `Dane inicjalne...pdf`, `Standardy i dobre praktyki...pdf` oraz DOCX/JSON z `dane_zadania/materialy/`.

### Dane przykładowe – `dane_zadania/blankiety/`

9 formularzy, każdy w wielu formatach (ta sama treść jako PDF, DOC, DOCX, ODS, XLSX, JPG, JPEG, PNG):

| # | Formularz | Oczekiwany JSON |
|---|---|---|
| 1 | Wniosek o ustalenie numeru porządkowego nieruchomości | **tak** (plus wizualizacja) |
| 5 | Wniosek o stwierdzenie nadpłaty podatku | **tak** (plus wizualizacja) |
| 2–4, 6–9 | zwrot opłaty skarbowej, zaświadczenie, wynajęcie świetlicy, zajęcie pasa drogowego, psy ras agresywnych, deklaracja odpadowa, stypendium sportowe (3 wnioski w 1) | nie, to formularze do oceny (3.1.II) |

Wnioski dla walidacji pliku:
- **Dwa pliki `.DOC` (formularze 5 i 7) to w rzeczywistości DOCX.** Rodzinę DOC traktujemy więc jako jedną: `.doc`/`.docx` przyjmują i OLE2, i OOXML, a ekstraktor wybieramy według wykrytej treści, a nie rozszerzenia.
- Rozszerzenia bywają pisane wielkimi literami (`.PDF`, `.JPG`), więc porównujemy bez rozróżniania wielkości liter.
- Formularz 7 ma plik `.JPE` (obcięte `.jpeg`). Specyfikacja wymienia tylko `.jpg` i `.jpeg`. Decyzja: przyjmujemy `.jpe` jako alias JPEG albo zostawiamy jako przypadek testowy odrzucenia (do potwierdzenia).

### Fakty z przykładowych JSON-ów (ważniejsze niż schemat i opis)

- **Struktura:** `tabs[].questions[]` to sekcje (`SECTION`), a pola leżą w `field.repeatingSectionGrid`, zawsze pisanym **poprawnie** (literówka `repetingSectionGrid` występuje tylko w schemacie). Głębokość jest stała: sekcja → pola.
- **Każde pole ma komplet kluczy**, także pustych: `id, type, techName, title, description, options, validation, readOnly, repeatingSectionGrid, states, questionOrder, tooltipMessage`. Opcjonalne klucze to `defaultValue`, `defaultValueType`, `dictionaryName`, `multiLevelTree`, `searchEnabled` i `consentSectionConfig`.
- **Układ:** siatka o szerokości 3 (`x=0`, `cols=3`). `y` i `questionOrder` to indeks w obrębie sekcji lub strony. `rows` pola to 1, a `rows` sekcji to 1–9 i rośnie z liczbą pól.
- **`description`** to HTML (`<html><head></head><body>…</body></html>`), także pusty, a w zgodach z linkiem do klauzuli.
- **Typy strony:** `MAIN` i `FINISH` (wielkie litery). Strony: „Dane” → strony tematyczne → „Kontakt z urzędem” lub „Kontakt i zgody” → „Strona końcowa”.
- **Adres w PL to jedno pole** `SELECT` ze słownikiem `TERYT_4G_DOWODOWY`, z `multiLevelTree: true`, `searchEnabled: true` i `title` równym nazwie słownika. Pola województwa, powiatu i gminy nie są osobne. Słowniki w użyciu: `Kraje`, `TERYT_4G_DOWODOWY`, `TERYT_DOWODOWY`.
- **Gałęzie adresu:** pola z sufiksem `_zagranica` mają `states` SHOW zależne od pola `kraj`.
- **Opcje:** `id` to nazwa opcji, a nie UUID, i `techName` czasem nie występuje. `flow.links[].id` to dowolny string.
- **Dane inicjalne:** `defaultValue: "PESEL.name"` lub `"MLPZ.email"` plus `EXTERNAL_SYSTEM` i `readOnly: true`. Wzorzec 1 używa MLPZ, wzorzec 5 PESEL dla „Twoich danych”.
- **`defaultValue` dla SELECT** to `[]`, a dla TEXT_FIELD string.
- **Jsonata** w `states` dokładnie według wzorca z reguł (`... .field.repeatingSectionGrid['x' in field.techName].field.__userAnswer`). Używany jest tylko typ `SHOW`.

**Sprzeczności przykładów z regułami** (do rozstrzygnięcia z mentorami, domyślnie idziemy za przykładami):
1. W przykładach `validation` jest **zawsze `[]`**, także dla pól wymaganych. Reguły wymagają obligatoryjności i listują walidatory (REQUIRED, PESEL…). Proponujemy emitować walidatory, bo to punktowane rozszerzenie VI i wymóg reguł, a przełącznik `EMIT_VALIDATORS` zostawić w konfiguracji.
2. Strona `FINISH` w przykładach zawiera `SECTION` z `TEXT_BLOCK`, a reguły mówią „wyłącznie `INFO_SECTION`”. Idziemy za przykładami; walidator reguł akceptuje oba warianty.

**Konsekwencja dla buildera:** sekcje predefiniowane (Urząd/Organ, Podmiot wniosku, Twoje dane, Adres zamieszkania i siedziby, Dane innej osoby, Dane podmiotu, Pełnomocnictwo, Opłata skarbowa, Kontakt, Zgoda, Strona końcowa) **wycinamy z przykładowych JSON-ów** jako gotowe szablony (`builder/templates/*.json`). Builder zmienia w nich tylko UUID, nazwę urzędu i ścieżki jsonaty (tytuł strony), zamiast budować je od zera.

## 1. Co musimy dostarczyć (backend)

**Obowiązkowe (3.2, 5):**
- REST API: przyjmuje **jeden plik** (PDF, DOC, DOCX, ODS, XLSX, JPG/JPEG, PNG) i zwraca JSON `FormDefinition` gotowy do importu.
- Wynik zgodny ze schematem `importowanyPlikJsonSchemat (1).json` i z regułami technicznymi: min. 2 strony, ostatnia `FINISH` zawiera tylko `INFO_SECTION`, każde pole siedzi w sekcji, sekcje nie są zagnieżdżone, każde pole ma określoną obligatoryjność, strony są połączone `flow`. Wynik musi też respektować standardy projektowania (sekcje predefiniowane, kolejność stron).
- Walidacja pliku:
  - rozszerzenie zgodne z MIME (wykrywanym z zawartości),
  - nazwa ≤ 250 znaków i bez znaków `; : > < / \ | ' * % $`,
  - maks. rozmiar konfigurowalny parametrem.
- Plik przetwarzany tylko w pamięci lub w tmp na czas żądania; nic nie zapisujemy na dysku.
- Uwierzytelnianie JWT, a jego parametry w konfiguracji.
- Docker:
  - oficjalne obrazy z jawnymi wersjami, bez `latest`,
  - użytkownik bez uprawnień root,
  - wystawione tylko potrzebne porty,
  - sekrety podawane w runtime.
- README: build obrazu, uruchomienie, konfiguracja, opis REST API. Do tego dokumentacja architektury.

**Twarde ograniczenie:** wyłącznie open source bez copyleftu (bez AGPL i GPL), żadnych zewnętrznych API/SaaS/MCP i **żadnych LLM-ów dostępnych tylko przez API**. Model AI musi działać lokalnie.

**Rozszerzenia punktowane (3.3), wszystkie po stronie backendu:**
- I – podpięcie słowników i danych inicjalnych,
- II – propozycja nowego słownika,
- III – zależności i dynamiczne przepływy (jsonata `states`, `flow`),
- VI – walidatory pól (PESEL, NIP, REGON, ZIP_CODE, EMAIL…) i tryb batch.

Frontend (IV, V) jest poza naszym zakresem.

## 2. Architektura: pipeline w 4 krokach

```
upload ─► [1] walidacja pliku ─► [2] ekstrakcja treści ─► [3] analiza AI (lokalny LLM)
                                                              │  model pośredni (uproszczony)
                                                              ▼
                       JSON ◄─ [5] walidacja reguł ◄─ [4] budowanie FormDefinition (deterministycznie)
```

Kluczowa decyzja: **LLM nie generuje końcowego JSON-a.** Zwraca mały, łatwy do sprawdzenia *model pośredni*: strony, sekcje i pola z typem, etykietą, wymagalnością, opcjami i warunkami widoczności zapisanymi strukturalnie (`pole X == opcja Y`).

Resztę liczy deterministyczny Python:
- UUID, `techName`, układ `x/y/rows/cols`, `questionOrder`,
- zapytania jsonata,
- sekcje predefiniowane, słowniki, dane inicjalne,
- `flow.links`.

Dzięki temu wynik zawsze pasuje do schematu, mały lokalny model wystarcza, a tę logikę da się przetestować bez AI.

### [1] Walidacja wejścia – `ingest/validation.py`
- Nazwa pliku: długość i zakazane znaki → 422.
- Rozmiar: odczyt strumieniowy z limitem `MAX_FILE_SIZE_MB` → 413.
- MIME z magic bytes przez `puremagic` (MIT). Bez `python-magic`, które wymaga libmagic.
- Kontenery ZIP rozróżniamy po zawartości:
  - DOCX/XLSX po `[Content_Types].xml` i `word/` lub `xl/`,
  - ODS po pliku `mimetype` = `application/vnd.oasis.opendocument.spreadsheet`.
- DOC to kontener OLE2 (`D0 CF 11 E0`).
- Rozszerzenie porównujemy bez rozróżniania wielkości liter. `.doc` i `.docx` tworzą jedną rodzinę (OLE2 lub OOXML), bo w danych są pliki `.DOC` z treścią DOCX.
- Niezgodność rozszerzenia z treścią → 415.

### [2] Ekstrakcja – `extract/` (jeden moduł na format, wspólny wynik)
Wynik `ExtractedDocument`: lista bloków (tekst, tabela, „pole do wypełnienia” w rodzaju `......`, `☐` czy pustych komórek), kolejność czytania i numer strony.

| Format | Biblioteka | Licencja |
|---|---|---|
| PDF z warstwą tekstu | `pdfplumber` (tekst, tabele, prostokąty i checkboxy) | MIT |
| PDF skan | render stron przez `pypdfium2`, potem OCR | Apache/BSD |
| JPG/PNG | OCR: Tesseract + `pytesseract`, język `pol` | Apache 2.0 |
| DOCX | `python-docx` (akapity, tabele, `☐`, pola formularza) | MIT |
| DOC | konwersja `soffice --headless --convert-to docx` w tmp, potem ścieżka DOCX | MPL-2.0 ⚠️ |
| XLSX | `openpyxl` | MIT |
| ODS | `odfpy` | Apache 2.0 (do wyboru) |

**Nie używać:** PyMuPDF (AGPL), Marker i Surya (GPL), antiword (GPL).

⚠️ LibreOffice ma słaby copyleft na poziomie pliku i używamy go tylko jako zewnętrznego narzędzia. Trzeba to potwierdzić z mentorem; jeśli się nie zgodzi, DOC zostaje bez obsługi i zwraca czytelny błąd.

Alternatywa: **Docling** (MIT) obsługuje PDF, DOCX, XLSX i obrazy z analizą układu i OCR w jednej bibliotece, ale ciągnie torch (obraz ma kilka GB). Decyzja w kroku 0 po teście na przykładowych plikach.

### [3] Analiza AI – `ai/`
- Lokalny serwer LLM: **Ollama** (MIT) jako osobny serwis w `docker-compose`. Adres w `LLM_BASE_URL`, żeby na Macu dało się wskazać natywną Ollamę z GPU zamiast kontenera bez GPU.
- Kandydaci na model (Apache 2.0, polski): **Bielik 11B v2** (polski), **Qwen2.5 7B/14B Instruct**. Do skanów opcjonalnie VLM **Qwen2.5-VL 7B** zamiast Tesseracta. Wybór po teście na przykładach.
- Wymuszony format: `format=<JSON Schema modelu pośredniego>` (structured outputs w Ollama), a odpowiedź parsuje Pydantic. Przy błędzie parsowania ponawiamy raz z komunikatem błędu.
- Duże dokumenty dzielimy na strony lub sekcje i scalamy wyniki.
- W prompcie: definicje typów pól, wymagany porządek stron (dane stron → sprawa → kontakt i oświadczenia → podsumowanie) i zasady upraszczania z „Standardów” (np. zgody to `CONSENT_SECTION`, a nie checkboxy). Dokładamy 1–2 przykłady few-shot z dostarczonych par formularz → JSON.
- Model pośredni wykrywa też **flagi**: `allows_other_person`, `allows_legal_entity`, `requires_proxy`, `has_fee`, nazwę urzędu lub organu oraz tytuł zaczynający się od „Wniosek”, „Zgłoszenie”, „Deklaracja” lub „Oświadczenie”.

### [4] Budowanie FormDefinition – `builder/` (czysty Python, w pełni testowalny)
- **Sekcje predefiniowane** jako szablony JSON wycięte z przykładów (`builder/templates/*.json`), włączane flagami z kroku [3]: Urząd/Organ, Podmiot wniosku, Twoje dane, Adres zamieszkania i siedziby (Kraj + `TERYT_4G_DOWODOWY` + gałąź `_zagranica`), Dane innej osoby, Dane podmiotu, Pełnomocnictwo, Opłata skarbowa, Kontakt, Zgoda i strona końcowa.
- **Strony:** „Dane”, potem strony tematyczne z LLM, potem kontakt i zgody, na końcu `FINISH` („Strona końcowa”). `flow.links` łączy kolejne strony liniowo (a→b).
- **Struktura:** sekcja to `question` z `field.type = SECTION/REPEATING_SECTION`, a pola leżą w `field.repeatingSectionGrid`. Każde pole ma komplet kluczy (patrz „Fakty z przykładowych JSON-ów”).
- **Identyfikatory:** `uuid4` dla tabs i fields. `id` opcji to jej nazwa. `techName` to slugify etykiety (ASCII, snake_case), unikalne w obrębie sekcji.
- **Układ:** siatka 3 kolumn, `x=0`, `cols=3`, `rows=1` dla pola, `rows` sekcji według liczby pól. `y` i `questionOrder` to indeks w kontenerze.
- **Jsonata:** generator z warunków strukturalnych według wzorca z dokumentu:
  `"Opcja" in tabs['<tab>' in title].questions['<sekcja>' in field.techName].field.repeatingSectionGrid['<pole>' in field.techName].field.__userAnswer`.
  Obsługuje OR/AND (Pełnomocnictwo zależy od dwóch pól). Testy uruchamiają zapytania na przykładowych odpowiedziach przez `jsonata-python` (licencję sprawdzić) albo przez porównanie z wzorcem.
- **Słowniki (rozszerzenie I/II):** dopasowanie regułami po etykiecie: adres w PL (województwo, powiat, gmina, miejscowość) → jedno pole `TERYT_4G_DOWODOWY` z `multiLevelTree`, kraj → `Kraje`, numer kierunkowy → słownik numerów kierunkowych → `dictionaryName`. Tylko dla SELECT/RADIO/CHECKBOX, a wtedy `options: []`. Nowe słowniki proponujemy z gotowej listy (np. urzędy skarbowe, rodzaje podatków, stan cywilny, rodzaj dokumentu tożsamości), z nazwą, strukturą i uzasadnieniem w odpowiedzi API.
- **Dane inicjalne (rozszerzenie I):** mapowanie etykieta → `PESEL.*`, `PESEL_ADDRESS.*`, `MLPZ.*` z tabel z PDF (wbudowany katalog `catalog/initial_data.py`). Pole dostaje `readOnly: true`, `defaultValue: "MLPZ.name"` i `defaultValueType: "EXTERNAL_SYSTEM"`. Tylko dla danych wnioskodawcy, nigdy dla „innej osoby”.
- **Walidatory (rozszerzenie VI):** `REQUIRED` z modelu pośredniego oraz heurystyki po etykiecie: PESEL, NIP, REGON, kod pocztowy (`ZIP_CODE`), e-mail, ePUAP, ADE, seria i numer dowodu.

### [5] Walidacja wyniku – `rules/`
- Walidacja JSON Schema (`jsonschema`, MIT) na dostarczonym schemacie.
- Reguły biznesowe jako osobne funkcje z kodem błędu: ≥2 strony, dokładnie jedna `FINISH` (ostatnia), na `FINISH` tylko `INFO_SECTION`, każda strona ma pole, brak zagnieżdżonych sekcji, każde pole wejściowe ma określoną wymagalność, tytuł ≤255 znaków, unikalne `techName`, `states` wskazują istniejące pola i opcje, `flow` spina wszystkie strony.
- Builder musi przechodzić te reguły. Wystawiamy je też jako endpoint do sprawdzania gotowych JSON-ów.

## 3. API

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/api/auth/token` | login i hasło z konfiguracji → JWT (`PyJWT`, MIT) |
| POST | `/api/forms/convert` | multipart, **jeden plik** → `FormDefinition`. `?include=warnings` dokłada ostrzeżenia, `?include=intermediate` model pośredni (debug) |
| POST | `/api/forms/validate` | JSON → lista naruszeń reguł |
| POST | `/api/forms/convert-batch` | (rozszerzenie VI) kilka plików → lista wyników lub błędów per plik |
| GET | `/api/dictionaries` | słowniki predefiniowane i proponowane |
| GET | `/api/initial-data-sources` | źródła i atrybuty danych inicjalnych |
| GET | `/api/health` | jest; dołożyć sprawdzenie dostępności LLM |

Endpointy oprócz `health` i `auth/token` wymagają `Authorization: Bearer`. Błędy w jednolitym formacie `{code, message, details}`. OpenAPI z FastAPI (`/docs`) spełnia wymóg opisu API, a w README dajemy skrót z przykładami `curl`.

Przetwarzanie jest synchroniczne (`run_in_threadpool` dla ekstrakcji i LLM). Kolejkę zadań pomijamy; wrócimy do niej, jeśli czas odpowiedzi przekroczy timeouty.

## 4. Konfiguracja – `config.py` (`pydantic-settings`, zmienne środowiskowe)

`MAX_FILE_SIZE_MB`, `JWT_SECRET` (wymagany, bez wartości domyślnej), `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_S`, `OCR_LANG=pol`, `LIBREOFFICE_PATH`. Plik `.env.example` w repo, `.env` w `.gitignore`.

## 5. Docker – poprawki do obecnego Dockerfile

- Dodać użytkownika bez roota (`USER app`).
- Przypiąć wersje obrazów: `node:24.x-alpine`, `python:3.14.x-slim` plus binarkę uv z `ghcr.io/astral-sh/uv:<wersja>`.
- Dołożyć `tesseract-ocr`, `tesseract-ocr-pol` i LibreOffice (jeśli zostaje).
- Alpine tylko wtedy, gdy nie bierzemy Doclinga ani torcha. Z nimi `-slim` i uzasadnienie w README.
- W `docker-compose.yml` dodać serwis `ollama` (przypięta wersja, wolumen na modele, port tylko w sieci compose) i `env_file`.

## 6. Kolejność prac

0. **Dane i decyzje (pierwsze godziny).** Wyciąć szablony sekcji predefiniowanych z 2 przykładowych JSON-ów. Spisać dla formularzy 1 i 5 model pośredni (ręcznie, z blankietu); to wejście testów buildera, a oczekiwany wynik to dostarczony JSON. Uruchomić 2–3 modele w Ollamie na 2 przykładach i wybrać model. Wybrać ekstrakcję (biblioteki per format albo Docling). Wyjaśnić z mentorami niejasności z sekcji 7.
1. **Szkielet kontraktu:** modele Pydantic `FormDefinition` z dokładnymi nazwami pól ze schematu, `config.py`, JWT, walidacja pliku i endpoint `convert` zwracający stub. Do tego testy walidacji (nazwa, rozmiar, MIME).
2. **Reguły [5] i builder [4]** na ręcznie spisanym modelu pośrednim dla 1 przykładu. Test: wynik przechodzi JSON Schema i reguły oraz jest zbliżony do oczekiwanego JSON-a.
3. **Ekstrakcja [2]:** PDF tekstowy i DOCX, potem XLSX i ODS, potem OCR (obrazy, skany), na końcu DOC.
4. **AI [3]:** prompt, structured output, few-shot i połączenie całego pipeline'u.
5. **Rozszerzenia:** słowniki i dane inicjalne, jsonata i zależności, walidatory, nowe słowniki, batch.
6. **Ewaluacja:** skrypt `scripts/evaluate.py`. Uruchamia pipeline na wszystkich 9 formularzach w każdym formacie. Dla formularzy 1 i 5 porównuje wynik z oczekiwanym JSON-em (pokrycie pól, typy, sekcje, `states`). Dla pozostałych sprawdza reguły i zgodność wyników między formatami tego samego formularza. Zapisuje wynikowe JSON-y, które są wymaganym elementem zgłoszenia.
7. **Docker i README** z opisem architektury (diagram pipeline'u) zgodnie z pkt 4–5 zadania.

Testy (`pytest`): walidacja wejścia, każda reguła, builder (snapshot), generator jsonaty, mapowanie słowników i danych inicjalnych. LLM mockujemy w testach jednostkowych, a ewaluacja z prawdziwym modelem idzie osobnym skryptem.

## 7. Niejasności w materiałach (do potwierdzenia z mentorami)

Rozstrzygnięte przez przykładowe JSON-y: `repeatingSectionGrid` (poprawna pisownia), `MAIN`/`FINISH`, `defaultValue` jako `[]` dla SELECT, `required` per zgoda, `searchEnabled` i `multiLevelTree` jako dodatkowe klucze.

Otwarte:
- Puste `validation` w przykładach a wymagania reguł (patrz „Sprzeczności”).
- `FINISH`: `SECTION` + `TEXT_BLOCK` (przykłady) czy `INFO_SECTION` (reguły)?
- `.jpe` jako alias JPEG?
- Gdzie zapisać limity FILE_UPLOADER (liczba plików, rozmiar, formaty) i regex KRS? W przykładach ich nie ma.
- Czy LibreOffice (MPL-2.0) jako narzędzie do konwersji DOC jest dopuszczalny?
- Sprzęt na obronę: czy uruchamiamy model na własnym laptopie? To decyduje o rozmiarze modelu.
