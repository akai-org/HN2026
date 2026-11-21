"""Block G: uploaded file -> form description, gluing blocks A (validation), B (extraction) and C (LLM)."""

from hacknation_2026.ai import analyze
from hacknation_2026.config import Settings
from hacknation_2026.contracts import ConvertResult
from hacknation_2026.extract import extract_document
from hacknation_2026.ingest.validation import validate_upload

# shortcut: blocks D (builder) and F (rules) are not merged yet, so `form` holds the LLM's FormSpec,
# not the final FormDefinition; replace with build_form() + check_form() once they land.
PARTIAL_RESULT_WARNING = "Wynik to opis formularza z modelu (FormSpec); budowa pełnego JSON-a (blok D) nie jest jeszcze podłączona."


def convert(filename: str, data: bytes, settings: Settings) -> ConvertResult:
  fmt = validate_upload(filename, data, settings.max_file_size_bytes)
  document = extract_document(data, fmt, settings.ocr_lang)
  spec = analyze(document, settings)
  return ConvertResult(form=spec.model_dump(mode="json"), warnings=[PARTIAL_RESULT_WARNING])
