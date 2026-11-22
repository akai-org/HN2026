"""Block C: extracted document -> FormSpec via LLM."""

import difflib
import re
import unicodedata

from pydantic import BaseModel, ValidationError

from hacknation_2026.config import Settings
from hacknation_2026.contracts import AppError, ExtractedDocument, FormSpec, PageSpec
from hacknation_2026.ai.client import LLMOutputError, chat
from hacknation_2026.ai.prompt import build_messages, completion_prompt, retry_prompt

MAX_ATTEMPTS = 2  # first try + one retry with the validation error
# Long forms: the model sometimes stops halfway. A fillable line ("____" or a box) whose words appear nowhere in the
# answer is "uncovered"; a few are normal (applicant data, date and place are skipped on purpose), many mean a gap.
MIN_UNCOVERED_LINES = 5
MIN_UNCOVERED_SHARE = 0.3
LINE_COVERED_AT = 0.5   # share of a line's words that must appear in the answer


# The title names the kind of document; anything else (OFERTA, Program konferencji, Karta menu) is not a form.
FORM_TITLE = re.compile(
  r"^\s*(wniosek|podanie|zgłoszenie|deklaracja|oświadczenie|formularz|zawiadomienie|informacja\b|kwestionariusz|karta\s+zgłoszenia)",
  re.IGNORECASE)
# The longest real form in the samples has ~23k characters of text; price lists and manuals have 75k–270k.
MAX_FORM_CHARS = 60_000


def _not_a_form(detail: str) -> AppError:
  return AppError("NOT_A_FORM", f"Plik nie wygląda na formularz do wypełnienia{detail}.", 422)


def _reject_if_not_a_form(spec: FormSpec, after_analysis: bool) -> None:
  """422 NOT_A_FORM when the model says the file is not a form, or (after the analysis) when its title is not
  the title of a form (no title, "OFERTA", "Program konferencji") or nothing fillable was found."""
  if not spec.is_form:
    reason = spec.not_form_reason.strip().rstrip(".")
    raise _not_a_form(f" ({reason})" if reason else "")
  if after_analysis and not FORM_TITLE.match(spec.title):
    raise _not_a_form(": jego tytuł nie wskazuje na wniosek, zgłoszenie, deklarację ani inny formularz")


class _MissingPages(BaseModel):
  """Answer to the completion request: only the pages the first answer left out."""
  pages: list[PageSpec] = []


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
      match = (by_case.get(condition.equals.lower())
               or next(iter(difflib.get_close_matches(condition.equals, choices, n=1, cutoff=0.6)), None)
               or (choices[0] if len(choices) == 1 else None))   # "true" for a single box -> its only option
      if match:
        condition.equals = match
  return spec


def _capitalize_options(spec: FormSpec) -> FormSpec:
  """Standardy: options start with a capital letter; the model copies them lowercase from the paper ("zaliczyć …").
  Conditions pointing at them are matched again by `_fix_conditions` (case-insensitive)."""
  for page in spec.pages:
    for section in page.sections:
      for f in section.fields:
        if f.type == "CHECKBOX" and not f.options:   # a single box ("[ ] Chodnik"): its one option is "Tak"
          f.options = ["Tak"]
        f.options = [_capitalize(o) for o in f.options]
  return spec


def _capitalize(option: str) -> str:
  first_word = option.split()[0] if option.split() else ""
  if any(ch.isupper() for ch in first_word[1:]):   # brand names keep their casing: "eDoręczenia", "ePUAP"
    return option
  return option[:1].upper() + option[1:]


def _stems(text: str) -> set[str]:
  """Word stems for a rough match despite Polish inflection: "miejscowości" ~ "Miejscowość", "ulicy" ~ "Ulica"."""
  ascii_text = unicodedata.normalize("NFKD", text.lower().replace("ł", "l")).encode("ascii", "ignore").decode()
  return {w[:min(6, max(4, len(w) - 2))] for w in re.findall(r"[a-z]{4,}", ascii_text)}


def _spec_text(spec: FormSpec) -> str:
  parts = [spec.title, *spec.consents]
  for page in spec.pages:
    parts.append(page.title)
    for section in page.sections:
      parts.append(section.title)
      for f in section.fields:
        parts += [f.label, f.description, *f.options]
  return " ".join(parts)


def uncovered_lines(doc: ExtractedDocument, spec: FormSpec) -> tuple[list[str], int]:
  """Fillable lines of the document with no counterpart in `spec` ("(strona N) line"), and the number of fillable lines."""
  covered = _stems(_spec_text(spec))
  fillable, missing = 0, []
  for block in doc.blocks:
    lines = [" | ".join(row) for row in block.rows or []] if block.kind == "table" else [block.text]
    for line in lines:
      if block.kind != "checkbox" and "____" not in line and "[ ]" not in line:
        continue
      stems = _stems(line)
      if not stems:
        continue
      fillable += 1
      if len(stems & covered) / len(stems) < LINE_COVERED_AT:
        missing.append(f"(strona {block.page}) {('[ ] ' if block.kind == 'checkbox' else '') + line}")
  return missing, fillable


def _merge_pages(spec: FormSpec, extra: list[PageSpec]) -> FormSpec:
  """Appends the completion's pages. A field repeating an existing one (same key and label) is dropped;
  another key collision is renamed, since keys must be unique in the form."""
  existing = {f.key: f.label for page in spec.pages for s in page.sections for f in s.fields}
  sections = {s.key for page in spec.pages for s in page.sections}
  for page in extra:
    for section in page.sections:
      while section.key in sections:
        section.key += "_2"
      sections.add(section.key)
      kept = []
      for f in section.fields:
        if existing.get(f.key) == f.label:
          continue
        # shortcut: conditions inside the new pages keep pointing at the old key, fine while the model names keys uniquely
        while f.key in existing:
          f.key += "_2"
        existing[f.key] = f.label
        kept.append(f)
      section.fields = kept
  spec.pages += [p for p in extra if any(s.fields for s in p.sections)]
  return spec


def _complete(doc: ExtractedDocument, spec: FormSpec, messages: list, raw: str, settings: Settings) -> FormSpec:
  """One extra request when the answer misses a large part of the form; the first answer stays if it fails."""
  missing, fillable = uncovered_lines(doc, spec)
  if len(missing) < MIN_UNCOVERED_LINES or len(missing) < MIN_UNCOVERED_SHARE * fillable:
    return spec
  follow_up = [*messages, {"role": "assistant", "content": raw}, {"role": "user", "content": completion_prompt(missing)}]
  try:
    reply = chat(follow_up, settings, _MissingPages.model_json_schema())
    extra = _MissingPages.model_validate_json(_strip_fences(reply))
  except (AppError, LLMOutputError, ValidationError):
    return spec
  return _merge_pages(spec, extra.pages)


def analyze(doc: ExtractedDocument, settings: Settings) -> FormSpec:
  if not doc.as_text().strip() or not doc.blocks:
    raise AppError("EMPTY_DOCUMENT", "Nie udało się odczytać tekstu z pliku.", 422)

  if len(doc.as_text()) > MAX_FORM_CHARS:   # before the LLM: a 60-page manual would take minutes to analyse
    raise _not_a_form(f": ma {len(doc.as_text()) // 1000} tys. znaków tekstu, a formularze mają do kilkudziesięciu tysięcy")

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
        spec = FormSpec.model_validate_json(_strip_fences(raw))
      except ValidationError as exc:
        last_error = exc
      else:
        _reject_if_not_a_form(spec, after_analysis=False)   # before the completion request: no extra call for a menu
        spec = _fix_conditions(_capitalize_options(_complete(doc, spec, messages, raw, settings)))
        _reject_if_not_a_form(spec, after_analysis=True)
        return spec
    messages = [
      *messages,
      {"role": "assistant", "content": raw or "(brak poprawnej odpowiedzi)"},
      {"role": "user", "content": retry_prompt(last_error)},
    ]

  raise AppError("LLM_INVALID_RESPONSE", f"Model językowy nie zwrócił poprawnego opisu formularza: {str(last_error)[:500]}", 502)
