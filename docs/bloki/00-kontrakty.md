# Blok 0 – Kontrakty (sekwencyjnie, pierwszy, ~1 h)

Część rozwiązania opisanego w `docs/plan-implementacji.md`. Indeks bloków i zależności: `docs/bloki/README.md`.

> **Status: zrobione.** Kod jest w `src/hacknation_2026/contracts.py` i `src/hacknation_2026/config.py` (testy: `tests/contracts/`) i to on jest źródłem prawdy. Dodatkowo `Settings.max_file_size_bytes` (wynik w bajtach) oraz czytanie `.env`.

## Zadanie

**Pliki:** `src/hacknation_2026/contracts.py`, `src/hacknation_2026/config.py`, `tests/contracts/`

**Zadanie:** utworzyć dokładnie poniższe typy. Pozostali agenci kodują względem nich.

```python
# contracts.py
from enum import StrEnum
from typing import Any, Literal
from pydantic import BaseModel, Field

# --- błędy ---
class AppError(Exception):
  def __init__(self, code: str, message: str, status: int = 400):
    super().__init__(message)
    self.code, self.message, self.status = code, message, status

# --- A → B: wykryty format (z ZAWARTOŚCI pliku, nie z rozszerzenia) ---
class FileFormat(StrEnum):
  PDF = "pdf"; DOC = "doc"; DOCX = "docx"; ODS = "ods"; XLSX = "xlsx"; JPEG = "jpeg"; PNG = "png"

# --- B → C: treść wyciągnięta z pliku ---
class Block(BaseModel):
  kind: Literal["text", "table", "checkbox"]
  text: str = ""                           # dla checkbox: etykieta pola wyboru
  checked: bool | None = None              # tylko checkbox
  rows: list[list[str]] | None = None      # tylko table
  page: int = 1

class ExtractedDocument(BaseModel):
  format: FileFormat
  blocks: list[Block]
  def as_text(self) -> str: ...            # płaski tekst dla LLM; tabele jako wiersze "a | b | c", checkbox jako "[ ] etykieta"

# --- C → D: opis formularza zwracany przez LLM ---
FieldType = Literal["TEXT_FIELD", "TEXTAREA", "NUMBER", "DATEPICKER", "RADIO",
                    "CHECKBOX", "SELECT", "FILE_UPLOADER", "TEXT_BLOCK"]

class Condition(BaseModel):
  field: str        # FieldSpec.key pola sterującego
  equals: str       # nazwa opcji

class FieldSpec(BaseModel):
  key: str                          # snake_case, unikalny w formularzu
  label: str
  type: FieldType
  required: bool
  description: str = ""             # zwykły tekst (builder robi z niego HTML)
  options: list[str] = []           # dla RADIO/CHECKBOX/SELECT
  show_if: list[Condition] = []     # wszystkie warunki muszą być spełnione (AND)

class SectionSpec(BaseModel):
  key: str
  title: str
  repeating: bool = False
  fields: list[FieldSpec]
  show_if: list[Condition] = []

class PageSpec(BaseModel):
  title: str
  sections: list[SectionSpec]

class FormSpec(BaseModel):
  title: str                                    # zaczyna się od Wniosek/Zgłoszenie/Deklaracja/Oświadczenie
  authority_name: str = ""                      # np. "Urząd Gminy X" / "Wójt Gminy Y"
  authority_kind: Literal["URZAD", "ORGAN"] = "URZAD"
  allows_other_person: bool = False
  allows_legal_entity: bool = False
  allows_proxy: bool = False                    # pełnomocnictwo
  pages: list[PageSpec]                         # TYLKO strony merytoryczne (bez danych wnioskodawcy, kontaktu, zgód, strony końcowej)
  consents: list[str] = []                      # treści oświadczeń/zgód z blankietu

# --- D → F → API: wynik ---
FormDefinition = dict[str, Any]                 # kształt jak we wzorcach; walidacja kształtu w bloku F

class RuleViolation(BaseModel):
  code: str
  message: str
  path: str = ""                                # np. "tabs[0].questions[2].field"

class ConvertResult(BaseModel):
  form: FormDefinition
  warnings: list[str] = []
```

```python
# config.py – pydantic-settings, zmienne środowiskowe
class Settings(BaseSettings):
  max_file_size_mb: int = 10
  llm_base_url: str = "http://127.0.0.1:11434"
  llm_model: str = "bielik"          # finalna nazwa po wyborze w bloku C
  llm_timeout_s: int = 300
  ocr_lang: str = "pol"
  emit_validators: bool = True
def get_settings() -> Settings: ...  # z lru_cache
```

**Gotowe, gdy:** typy się importują, `ExtractedDocument.as_text()` ma test, `Settings` czyta zmienne środowiskowe (test z `monkeypatch`).

## Zasady wspólne

- **Najpierw blok 0** (kontrakty). Wszystkie inne bloki startują równolegle po nim i komunikują się **wyłącznie** przez typy z bloku 0.
- Każdy blok **ma na wyłączność** wymienione pliki. Nie edytuj plików innego bloku. Jeśli kontrakt jest niewystarczający, zgłoś to, zamiast go zmieniać.
- Brakującą zależność od innego bloku zastąp stubem we własnych testach (mock), a nie w cudzym pliku.
- Python z wcięciem **2 spacjami**. Zależności dodawaj przez `uv add` (konflikt w `pyproject.toml`/`uv.lock` rozwiązuje się przez ponowne `uv add`).
- Testy: `uv run pytest tests/<blok>/`. Blok jest skończony, gdy jego testy przechodzą.
- **Nie rób `git commit`.** Commituje człowiek.
- Licencje: tylko MIT, BSD, Apache 2.0 lub podobne. Żadnego GPL ani AGPL (np. PyMuPDF), żadnych zewnętrznych API.
- Dane testowe: `dane_zadania/blankiety/` (9 formularzy w wielu formatach). Wzorce wyniku to `1.*/konfiguracja_form_*.json` i `5.*/konfiguracja_form_*.json`. **W kodzie aplikacji nie może być treści żadnego konkretnego formularza.**
