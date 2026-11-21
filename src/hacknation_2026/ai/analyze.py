"""Block C: extracted document -> FormSpec via LLM."""

import re

from pydantic import ValidationError

from hacknation_2026.config import Settings
from hacknation_2026.contracts import AppError, ExtractedDocument, FormSpec
from hacknation_2026.ai.client import LLMOutputError, chat
from hacknation_2026.ai.prompt import build_messages, retry_prompt

MAX_ATTEMPTS = 2  # first try + one retry with the validation error

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


def _strip_fences(raw: str) -> str:
  match = _FENCE.match(raw)
  return match.group(1) if match else raw.strip()


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
        return FormSpec.model_validate_json(_strip_fences(raw))
      except ValidationError as exc:
        last_error = exc
    messages = [
      *messages,
      {"role": "assistant", "content": raw or "(brak poprawnej odpowiedzi)"},
      {"role": "user", "content": retry_prompt(last_error)},
    ]

  raise AppError("LLM_INVALID_RESPONSE", f"Model językowy nie zwrócił poprawnego opisu formularza: {str(last_error)[:500]}", 502)
