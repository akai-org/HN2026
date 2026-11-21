# Blok E – Wzbogacanie pól

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

> **Status: zrobione.** Kod: `src/hacknation_2026/enrich/` (`enrich.py`, `catalog.py`), testy: `tests/enrich/`. Builder (blok D) woła `enrich_field` dla każdego pola merytorycznego, a pipeline (blok G) zwraca `proposed_dictionaries` w `ConvertResult`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ProposedDictionary`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

## Zadanie

**Pliki:** `src/hacknation_2026/enrich/` (`enrich.py`, `catalog.py`), `tests/enrich/`

**Interfejs:**
```python
class Enrichment(BaseModel):
  dictionary_name: str | None = None
  multi_level_tree: bool = False
  search_enabled: bool = False
  default_value: str | None = None         # np. "MLPZ.email"
  external: bool = False                    # → defaultValueType="EXTERNAL_SYSTEM"
  read_only: bool = False                   # True dla każdej wartości z danych inicjalnych, także adresu i kontaktu (Dane inicjalne)
  validators: list[str] = []                # REQUIRED, EMAIL, PESEL, NIP, REGON, ZIP_CODE, EPUAP, ADE, SERIAL_NUMBER_ID_CARD
  field_type: str | None = None             # nowy typ dla TEXT_FIELD: kraj → SELECT (Kraje), data urodzenia → DATEPICKER

def enrich_field(label: str, field_type: str, required: bool, applicant_data: bool) -> Enrichment
def proposed_dictionaries(spec: FormSpec) -> list[ProposedDictionary]   # rozszerzenie: {name, values_example, used_by}
```

**Źródła.** Reguły biorą się z dokumentów w `dane_zadania/materialy/`. Wzorce JSON mogą zawierać błędy i służą tylko do porównania tam, gdzie dokumenty milczą.
- „Dane inicjalne”: źródła `PESEL` (16 atrybutów), `PESEL_ADDRESS` (18) i `MLPZ` (17), każdy atrybut z polską nazwą i typem pola. Pole zasilane danymi inicjalnymi „musi być oznaczone jako pole wyłącznie do odczytu”.
- Standardy: „Twoje dane”, adres i kontakt biorą wartości z `MLPZ`. Walidatory PESEL, NIP, REGON, Email i Kod pocztowy; kod pocztowy spoza Polski jest bez walidacji. Słowniki `Kraje` i `TERYT_4G_DOWODOWY` z wyszukiwaniem. Numer KRS ma w Standardach wyrażenie regularne, którego nie ma na liście walidatorów, więc go pomijamy.
- Słowniki: `Kraje` i słowniki adresowe tylko na liście rozwijanej. Propozycje nowych słowników to opcjonalne rozszerzenie.
- Reguły techniczne: dozwolona lista walidatorów.

**Wymagania:**
- `catalog.py` zawiera same dane (atrybuty, frazy etykiet, słowniki, walidatory) z odnośnikiem do dokumentu. Logika jest w `enrich.py`.
- Dopasowanie po znormalizowanej etykiecie (małe litery, bez polskich znaków, całe słowa), bez LLM. Wygrywa najdłuższa fraza („Imię matki” przed „Imię”). Dwie różne wartości w jednej etykiecie („Imię i nazwisko”, „NIP lub PESEL”) oznaczają brak dopasowania.
- Dane inicjalne tylko gdy `applicant_data=True` i nigdy dla innej osoby („PESEL małżonka”, „Nazwisko rodowe matki”). Każde pole z danymi inicjalnymi ma `readOnly: true`, także adres i kontakt; builder i tak to wymusza. Typ pola musi zgadzać się z typem atrybutu, a `TEXT_FIELD` z datą urodzenia zmienia się w `DATEPICKER`. Adres zameldowania (`PESEL_ADDRESS.permanentAddress*`, `temporaryAddress*`) tylko wtedy, gdy etykieta mówi o zameldowaniu.
- Słownik tylko na `SELECT`. `TEXT_FIELD`, którego etykieta zaczyna się od kraju, państwa lub obywatelstwa, staje się `SELECT` ze słownikiem `Kraje`. Builder stosuje słownik z bloku E tylko dla pola bez własnych opcji. `TERYT_DOWODOWY` (występuje tylko we wzorcach) i numery kierunkowe (brak nazwy technicznej) pomijamy.
- Walidatory formatu tylko dla `TEXT_FIELD` i `NUMBER`. `REQUIRED` dokładamy, gdy `required`.
- `proposed_dictionaries` proponuje słownik dla listy opcji, która ma co najmniej 6 wartości albo powtarza się w kilku polach (co najmniej 3 wartości). Pomija listy tak/nie, zdania i listy pokryte przez istniejące słowniki.

**Gotowe, gdy:** testy tabelaryczne przechodzą, np. `("Adres e-mail", "TEXT_FIELD", False, True)` → `MLPZ.email` + `EMAIL` + `readOnly`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
