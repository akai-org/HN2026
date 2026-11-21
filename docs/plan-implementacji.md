# Plan implementacji backendu

## Cel

Urzędnik wysyła plik z formularzem (PDF, DOC/DOCX, ODS, XLSX, JPG/JPEG, PNG) i dostaje JSON z cyfrową wersją tego formularza, gotowy do importu.

W kodzie nie ma treści żadnego konkretnego formularza. Wszystko, co zależy od formularza, pochodzi z przesłanego pliku.

## Ograniczenia z treści zadania

- AI działa **lokalnie**: żadnych zewnętrznych API ani LLM-ów dostępnych tylko przez API.
- Biblioteki open source bez copyleftu. Odpada np. PyMuPDF (AGPL).
- Walidacja pliku:
  - MIME z zawartości musi pasować do rozszerzenia,
  - nazwa ≤ 250 znaków i bez `; : > < / \ | ' * % $`,
  - limit rozmiaru konfigurowalny.
- Plik tylko w pamięci, nic nie zapisujemy na dysku.
- JWT, konfiguracja przez zmienne środowiskowe.
- Docker: przypięte wersje obrazów, użytkownik bez uprawnień roota.
- README: build, uruchomienie, konfiguracja, API.

## Jak to działa

```
plik ─► walidacja ─► tekst z pliku ─► lokalny LLM ─► builder ─► kontrola reguł ─► JSON
```

1. **Walidacja pliku.** Nazwa, rozmiar i MIME (`puremagic`). `.doc`/`.docx` traktujemy jako jedną rodzinę, bo w danych są pliki `.DOC` z treścią DOCX. Rozszerzenia porównujemy bez rozróżniania wielkości liter.
2. **Tekst z pliku.** Biblioteki per format:
   - PDF: `pdfplumber`,
   - DOCX: `python-docx`,
   - XLSX: `openpyxl`,
   - ODS: `odfpy`,
   - obrazy i skany: OCR Tesseract z językiem polskim,
   - DOC: plik z treścią DOCX czytamy jak DOCX, binarny Word (7 z 9 plików w danych) według bloku B2 (`docs/bloki/B2-ekstrakcja-word.md`).
3. **LLM (Ollama, np. Bielik lub Qwen).** Czyta tekst i zwraca **prosty opis formularza**:
   - tytuł, nazwę urzędu,
   - kto może składać (sam, inna osoba, firma), czy jest pełnomocnictwo,
   - pola merytoryczne pogrupowane w strony i sekcje: etykieta, typ, wymagalność, opcje, warunki widoczności typu „pokaż, gdy pole X = Y”.

   Format odpowiedzi jest wymuszony schematem i parsowany przez Pydantic.
4. **Builder (zwykły Python, bez AI).** Z tego opisu składa pełny JSON:
   - sekcje wymagane przez „Standardy” (Urząd, Podmiot wniosku, Twoje dane, Adres, Pełnomocnictwo, Kontakt, Zgoda, Strona końcowa),
   - UUID, `techName`, układ, jsonata w `states`, `flow`,
   - słowniki (`Kraje`, `TERYT_4G_DOWODOWY`), dane inicjalne (`MLPZ.*`, `PESEL.*`), walidatory (PESEL, NIP, e-mail…).
5. **Kontrola reguł.** Wynik musi spełniać reguły techniczne:
   - ≥ 2 strony, ostatnia `FINISH`,
   - każde pole w sekcji, sekcje bez zagnieżdżeń,
   - poprawne odwołania w `states`.

   Błędy wracają jako ostrzeżenia w odpowiedzi.

Dlaczego tak: model robi tylko to, czego bez AI się nie da, czyli zrozumienie formularza. Resztę robi kod, więc JSON zawsze ma poprawny format, a mały lokalny model wystarcza.

## Format wyniku

Wzorcem są 2 dostarczone JSON-y (`dane_zadania/blankiety/1.*` i `5.*`). Tam, gdzie różnią się od schematu, wygrywa wzorzec:
- poprawna pisownia to `repeatingSectionGrid`,
- struktura to strona → sekcje → pola, a każde pole ma komplet kluczy,
- `description` jest w HTML,
- układ to siatka 3 kolumn,
- adres w Polsce to jedno pole ze słownikiem `TERYT_4G_DOWODOWY`.

## API

| | |
|---|---|
| `POST /api/auth/token` | login → JWT |
| `POST /api/forms/convert` | plik → JSON formularza |
| `GET /api/health` | stan aplikacji i LLM |

Opis API generuje FastAPI (`/docs`).

## Kolejność prac

1. **Kontrakt:** modele Pydantic wyniku według wzorców, konfiguracja, JWT, walidacja pliku, endpoint `convert`.
2. **Builder i kontrola reguł:** test na ręcznie spisanym opisie formularza 5 → wynik zbliżony do wzorca 5.
3. **Ekstrakcja tekstu** dla wszystkich formatów.
4. **LLM:** prompt, wybór modelu na formularzach 1 i 5, spięcie całego pipeline'u.
5. **Ewaluacja:** skrypt przepuszcza wszystkie 9 blankietów. Wyniki 1 i 5 porównuje ze wzorcem, a dla pozostałych sprawdza reguły i zgodność między formatami.
6. **Docker** (serwis Ollama w compose, użytkownik bez uprawnień roota) i **README**.

## Do potwierdzenia z mentorami

- Wzorce mają puste `validation` nawet dla pól wymaganych, a reguły wymagają walidatorów. Domyślnie emitujemy walidatory.
- Strona końcowa: wzorce używają `SECTION` + `TEXT_BLOCK`, a reguły mówią o `INFO_SECTION`. Domyślnie idziemy za wzorcem.
- Czy LibreOffice (licencja MPL) do konwersji `.doc` jest dopuszczalny?
