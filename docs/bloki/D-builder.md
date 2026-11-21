# Blok D – Builder FormDefinition

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

**Używa interfejsów innych bloków:** `enrich_field()` i `Enrichment` z bloku E: `docs/bloki/E-wzbogacanie-pol.md` (sekcja Interfejs). Do czasu ich ukończenia mockuj je w swoich testach.

## Zadanie

**Pliki:** `src/hacknation_2026/builder/` (`build.py`, `standard_sections.py`, `jsonata.py`, `layout.py`), `tests/builder/`

**Interfejs:**
```python
def build_form(spec: FormSpec, settings: Settings) -> FormDefinition
```

**Wymagania (format według wzorców w `dane_zadania/blankiety/{1,5}.*/konfiguracja_form_*.json`; tam gdzie przeczą schematowi, wygrywa wzorzec):**
- **Struktura:** `{"title", "tabs": [...], "flow": {"links": [...]}}`. Strona to `{"id", "title", "type": "MAIN"|"FINISH", "questions"}`. `questions` to sekcje (`field.type` `SECTION`/`REPEATING_SECTION`), a pola leżą w `field.repeatingSectionGrid`.
- **Każde pole i sekcja ma komplet kluczy:** `id` (uuid4), `type`, `techName`, `title`, `description` (HTML `<html><head></head><body><p>…</p></body></html>`, pusty też w tej otoczce dla sekcji), `options` (`[{"id": nazwa, "name": nazwa, "techName": slug}]`), `validation`, `readOnly`, `repeatingSectionGrid`, `states`, `questionOrder`, `tooltipMessage`. Opcjonalnie `defaultValue`, `defaultValueType`, `dictionaryName`, `multiLevelTree`, `searchEnabled`.
- **Układ:** `x=0`, `cols=3`, `rows=1` dla pola, `rows` sekcji zależne od liczby pól. `y` i `questionOrder` to indeks w kontenerze.
- **Strony:** „Dane” (sekcje standardowe) → strony z `spec.pages` → „Kontakt i zgody” → „Strona końcowa” (`FINISH`, sekcja z `TEXT_BLOCK` o podglądzie). `flow.links` łączy strony liniowo.
- **`standard_sections.py`:** sekcje według dokumentu „Standardy i dobre praktyki” (`dane_zadania/materialy/HackNation - Standardy…pdf`), sterowane flagami `FormSpec`:
  - Urząd/Organ (`authority_name`, readOnly),
  - Podmiot wniosku (opcje według flag) i „Wybierz, jako kto wnioskujesz” (Pełnomocnik/Reprezentant, gdy `allows_legal_entity`),
  - Twoje dane (MLPZ.name/surname/pesel),
  - Adres zamieszkania: `kraj` (SELECT, słownik `Kraje`, `searchEnabled`), gałąź PL z jednym polem SELECT `TERYT_4G_DOWODOWY` (`multiLevelTree: true`), kod pocztowy, ulica, nr budynku, nr lokalu, oraz gałąź `_zagranica`,
  - Dane innej osoby + adres, Dane podmiotu + adres siedziby, Pełnomocnictwo, Opłata skarbowa,
  - Dane do kontaktu (MLPZ.phoneNumber/email), Zgoda (`CONSENT_SECTION` z `spec.consents` lub standardową klauzulą).
- **`jsonata.py`:** `Condition` → zapytanie według wzorca
  `("Opcja" in tabs['<tytuł strony>' in title].questions['<sekcja>' in field.techName].field.repeatingSectionGrid['<pole>' in field.techName].field.__userAnswer)`.
  AND łączy `and`, OR (potrzebny w sekcjach standardowych) łączy `or`.
- **`techName`:** slug z etykiety (bez polskich znaków, snake_case), unikalny w obrębie sekcji.
- Wzbogacanie pól (słowniki, dane inicjalne, walidatory) przez `enrich_field()` z bloku E. Do czasu bloku E zrób lokalny stub zwracający pusty wynik **we własnym teście**, a nie w pliku bloku E.

**Gotowe, gdy:** test – ręcznie spisany w `tests/builder/fixtures/` `FormSpec` dla formularza 5 (strona „Informacje o nadpłacie” odczytana z blankietu) daje JSON, który ma:
- te same tytuły stron,
- te same `techName` sekcji na stronie „Dane”,
- te same typy pól i `states` w sekcjach standardowych co wzorzec 5 (porównanie strukturalne bez `id`).

To samo dla formularza 1.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
