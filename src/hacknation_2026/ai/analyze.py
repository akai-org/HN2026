"""Block C: extracted document -> FormSpec via LLM."""

import difflib

from pydantic import ValidationError

from hacknation_2026.config import Settings
from hacknation_2026.contracts import AppError, ExtractedDocument, FormSpec
from hacknation_2026.ai.client import LLMOutputError, chat
from hacknation_2026.ai.prompt import build_messages, retry_prompt

MAX_ATTEMPTS = 2  # first try + one retry with the validation error

def _strip_fences(raw: str) -> str:
  """The JSON object inside the reply: models wrap it in Markdown fences, sometimes only half of them
  (EdenAI's Gemma returns ' {...}\\n```')."""
  start, end = raw.find("{"), raw.rfind("}")
  return raw[start:end + 1] if 0 <= start < end else raw.strip()


def _fix_conditions(spec: FormSpec) -> FormSpec:
  """Points every show_if at an existing option of its controlling field. The model sometimes garbles the
  option name ("wskazacheteur rachunek"), and a condition with a non-existent option never shows the field."""
  options = {f.key: f.options for page in spec.pages for s in page.sections for f in s.fields if f.options}
  conditions = [c for page in spec.pages for s in page.sections for c in s.show_if + [c for f in s.fields for c in f.show_if]]
  for condition in conditions:
    choices = options.get(condition.field, [])
    if choices and condition.equals not in choices:
      by_case = {c.lower(): c for c in choices}
      match = by_case.get(condition.equals.lower()) or next(iter(difflib.get_close_matches(condition.equals, choices, n=1, cutoff=0.6)), None)
      if match:
        condition.equals = match
  return spec


def analyze(doc: ExtractedDocument, settings: Settings) -> FormSpec:
  if not doc.as_text().strip() or not doc.blocks:
    raise AppError("EMPTY_DOCUMENT", "Nie udało się odczytać tekstu z pliku.", 422)

  messages = build_messages(doc)
  schema = FormSpec.model_json_schema()
  last_error: ValidationError | str = ""

  for _ in range(MAX_ATTEMPTS):
    try:
      raw = chat(messages, settings, schema)
    except LLMOutputError as exc:
      raw, last_error = exc.output, str(exc)
    else:
      try:
        return _fix_conditions(FormSpec.model_validate_json(_strip_fences(raw)))
      except ValidationError as exc:
        last_error = exc
    messages = [
      *messages,
      {"role": "assistant", "content": raw or "(brak poprawnej odpowiedzi)"},
      {"role": "user", "content": retry_prompt(last_error)},
    ]

  raise AppError("LLM_INVALID_RESPONSE", f"Model językowy nie zwrócił poprawnego opisu formularza: {str(last_error)[:500]}", 502)
