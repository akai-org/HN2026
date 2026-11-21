"""Block G: uploaded file -> FormDefinition, gluing blocks A (validation), B (extraction), C (LLM) and D (builder)."""

from hacknation_2026.ai import analyze
from hacknation_2026.builder import build_form
from hacknation_2026.config import Settings
from hacknation_2026.contracts import ConvertResult
from hacknation_2026.extract import extract_document
from hacknation_2026.ingest.validation import validate_upload


def convert(filename: str, data: bytes, settings: Settings) -> ConvertResult:
  fmt = validate_upload(filename, data, settings.max_file_size_bytes)
  document = extract_document(data, fmt, settings.ocr_lang)
  spec = analyze(document, settings)
  # shortcut: block F (rule checks) is not merged yet; its violations will go to `warnings`.
  return ConvertResult(form=build_form(spec, settings))
