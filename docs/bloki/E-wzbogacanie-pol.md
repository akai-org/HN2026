# Blok E – Wzbogacanie pól

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

**Wymaga:** ukończonego bloku 0. Typy (`AppError`, `FileFormat`, `ExtractedDocument`, `FormSpec`, `FormDefinition`, `RuleViolation`, `ConvertResult`, `Settings`) importuj z `hacknation_2026.contracts` i `hacknation_2026.config`; ich pełna definicja jest w `docs/bloki/00-kontrakty.md`.

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
  read_only: bool = False                   # tylko identyfikacja wnioskodawcy (imię, nazwisko, PESEL); adres i kontakt z MLPZ zostają edytowalne, jak we wzorcach
  validators: list[str] = []                # REQUIRED, EMAIL, PESEL, NIP, REGON, ZIP_CODE, EPUAP, ADE, SERIAL_NUMBER_ID_CARD

def enrich_field(label: str, field_type: str, required: bool, applicant_data: bool) -> Enrichment
def proposed_dictionaries(spec: FormSpec) -> list[dict]   # rozszerzenie: propozycje nowych słowników {name, values_example, used_by}
```

**Wymagania:**
- `catalog.py`: katalog źródeł danych inicjalnych `PESEL.*`, `PESEL_ADDRESS.*`, `MLPZ.*` przepisany z `dane_zadania/materialy/Dane inicjalne…pdf` (atrybut + polska nazwa) oraz listy słowników `Kraje`, `TERYT_4G_DOWODOWY`, `TERYT_DOWODOWY` i numerów kierunkowych.
- Dane inicjalne tylko gdy `applicant_data=True` (dane osoby wypełniającej, nigdy „innej osoby”). Wzorce: imię/nazwisko/PESEL → `readOnly: true` (wzorzec 1 `MLPZ.*`, wzorzec 5 `PESEL.*`); kod pocztowy, ulica, nr budynku, nr lokalu, telefon, e-mail → `MLPZ.*` z `readOnly: false`.
- Słownik tylko dla `SELECT`/`RADIO`/`CHECKBOX`.
- Walidatory według etykiety, np. „PESEL” → `PESEL`, „e-mail” → `EMAIL`, „kod pocztowy” → `ZIP_CODE`. `REQUIRED` dokładamy, gdy `required`.
- Dopasowanie po znormalizowanej etykiecie (małe litery, bez polskich znaków), bez LLM.

**Gotowe, gdy:** testy tabelaryczne, np. `("Adres e-mail", "TEXT_FIELD", False, True)` → `MLPZ.email` + `EMAIL`.

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
