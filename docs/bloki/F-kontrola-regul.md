# Blok F – Kontrola reguł

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

> **Status: zrobione.** `src/hacknation_2026/rules/check.py`, testy w `tests/rules/`. Pipeline (blok G) woła `check_form()` na formularzu z buildera, a każde naruszenie trafia do `ConvertResult.warnings` jako tekst „komunikat (ścieżka)”. Formularz wraca także wtedy, gdy łamie regułę. Przebieg 9 blankietów (PDF) przez cały pipeline dał 0 naruszeń.

## Zadanie

**Pliki:** `src/hacknation_2026/rules/` (`check.py`), `tests/rules/`

**Interfejs:**
```python
def check_form(form: FormDefinition) -> list[RuleViolation]
```

**Reguły** (z `dane_zadania/Reguły techniczne…pdf` i wzorców):
- tytuł niepusty, ≤ 255 znaków,
- ≥ 2 strony, dokładnie jedna `FINISH` i jest ostatnia, reszta `MAIN`,
- każda strona ma ≥ 1 pole,
- na najwyższym poziomie strony tylko `SECTION`/`REPEATING_SECTION`, bez sekcji w sekcji,
- na `FINISH` brak pól do wprowadzania danych (dozwolone `INFO_SECTION`, `TEXT_BLOCK`),
- komplet wymaganych kluczy w każdym polu, unikalne `id`; `states` traktuj jako opcjonalny, bo we wzorcu 1 sekcja `organ_do_ktorego_jest_skladany_wniosek` go nie ma (wzorce muszą dawać 0 naruszeń),
- `states[].type` ∈ {`SHOW`, `READ_ONLY`}, a `query` odwołuje się do istniejących strony, sekcji i pola (parsowanie regexem z wzorca jsonaty),
- `dictionaryName` tylko w `SELECT`/`RADIO`/`CHECKBOX`, `CONSENT_SECTION` ma `consentSectionConfig`,
- `flow.links` łączy wszystkie strony, a `source`/`target` istnieją.

**Gotowe, gdy:** oba wzorcowe JSON-y dają **0 naruszeń**, a każda reguła ma test na celowo zepsutej kopii wzorca.

## Ustalenia z ekspertami i znane naruszenia wzorców

Specyfikacja wygrywa ze wzorcami (`CLAUDE.md`). Ustalenia z ekspertami domenowymi:
- **Strona FINISH:** w sekcjach dozwolone są `INFO_SECTION` i `TEXT_BLOCK`. Inne pola są niedozwolone.
- **Dane inicjalne:** pole z `defaultValueType: EXTERNAL_SYSTEM` musi mieć `readOnly: true`. Wyjątki to tylko `MLPZ.phoneNumber` i `MLPZ.email`, bo te dane mogą być nieaktualne; lista jest w stałej `EDITABLE_INITIAL_DATA` we wspólnym module `src/hacknation_2026/initial_data.py` (używa go też builder). `defaultValue` musi wskazywać źródło i atrybut z tabel „Dane inicjalne”.
- **Identyfikatory:** `id` stron, pól i `flow.links` muszą być UUID i być unikalne.

Dlatego wzorce dają kilka **znanych** naruszeń. Wypisuje je `KNOWN_REFERENCE_VIOLATIONS` w `tests/rules/test_check.py`, a każda inna pozycja byłaby fałszywym alarmem:
- **Wzorzec 1 i 5:** adres z MLPZ (`kod_pocztowy`, `ulica`, `numer_budynku`, `numer_lokalu`) ma `readOnly: false`.
- **Wzorzec 1:** trzy pola mają `validation: {}`, a według Opisu JSON to ma być tablica.
- **Wzorzec 5:** opcja „Reprezentant” nie ma `techName`, a `flow.links[].id` to nie UUID.

Wynik buildera (blok D) daje 0 naruszeń.

Pełna lista kodów naruszeń jest w `rules/check.py`. Test `test_every_rule_has_a_broken_copy` pilnuje, żeby każdy kod miał test na zepsutej kopii wzorca.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
