"""Block G: uploaded file -> FormDefinition, gluing blocks A (validation), B (extraction), C (LLM), D (builder),
E (proposed dictionaries; field enrichment runs inside the builder) and F (rule check -> warnings)."""

from hacknation_2026.ai import analyze
from hacknation_2026.builder import build_form
from hacknation_2026.config import Settings
from hacknation_2026.contracts import ConvertResult, ExtractedDocument
from hacknation_2026.enrich import proposed_dictionaries
from hacknation_2026.extract import extract_document
from hacknation_2026.ingest.validation import validate_upload
from hacknation_2026.rules import check_form


def read_document(filename: str, data: bytes, settings: Settings) -> ExtractedDocument:
  """Blocks A and B only, without the LLM: the text the system read from the file."""
  fmt = validate_upload(filename, data, settings.max_file_size_bytes)
  return extract_document(data, fmt, settings.ocr_lang)


def convert(filename: str, data: bytes, settings: Settings) -> ConvertResult:
  document = read_document(filename, data, settings)
  spec = analyze(document, settings)
  form = build_form(spec, settings)
  # the form is still returned when it breaks a rule: the official reviews it, the frontend shows the warnings
  warnings = [f"{v.message} ({v.path})" if v.path else v.message for v in check_form(form)]
  return ConvertResult(form=form, warnings=warnings, proposed_dictionaries=proposed_dictionaries(spec))
