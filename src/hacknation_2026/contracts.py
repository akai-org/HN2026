"""Shared types between pipeline blocks (see docs/bloki/00-kontrakty.md). Change only by agreement."""

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel


# --- errors ---
class AppError(Exception):
  def __init__(self, code: str, message: str, status: int = 400):
    super().__init__(message)
    self.code, self.message, self.status = code, message, status


# --- A -> B: format detected from file CONTENT, not extension ---
class FileFormat(StrEnum):
  PDF = "pdf"
  DOC = "doc"
  DOCX = "docx"
  ODS = "ods"
  XLSX = "xlsx"
  JPEG = "jpeg"
  PNG = "png"


# --- B -> C: content extracted from the file ---
class Block(BaseModel):
  kind: Literal["text", "table", "checkbox"]
  text: str = ""                        # checkbox: label of the option
  checked: bool | None = None           # checkbox only
  rows: list[list[str]] | None = None   # table only
  page: int = 1


class ExtractedDocument(BaseModel):
  format: FileFormat
  blocks: list[Block]

  def as_text(self) -> str:
    lines: list[str] = []
    page = None
    for block in self.blocks:
      if block.page != page:
        page = block.page
        lines.append(f"--- strona {page} ---")
      if block.kind == "table":
        lines.extend(" | ".join(cell.strip() for cell in row) for row in block.rows or [])
      elif block.kind == "checkbox":
        lines.append(f"[{'x' if block.checked else ' '}] {block.text}")
      else:
        lines.append(block.text)
    return "\n".join(lines)


# --- C -> D: form description returned by the LLM ---
FieldType = Literal[
  "TEXT_FIELD", "TEXTAREA", "NUMBER", "DATEPICKER", "RADIO",
  "CHECKBOX", "SELECT", "FILE_UPLOADER", "TEXT_BLOCK",
]


class Condition(BaseModel):
  field: str    # FieldSpec.key of the controlling field
  equals: str   # option name


class FieldSpec(BaseModel):
  key: str                         # snake_case, unique within the form
  label: str
  type: FieldType
  required: bool
  description: str = ""            # plain text; builder wraps it in HTML
  options: list[str] = []          # RADIO / CHECKBOX / SELECT
  show_if: list[Condition] = []    # different fields: all must hold (AND); options of one field: any (OR)
  applicant_data: bool = False     # the applicant's own personal data; block E may feed it from a register


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
  is_form: bool = True                         # False: not a form to fill in and submit (menu, contract, manual...)
  not_form_reason: str = ""                    # what the document is instead, when is_form is False
  title: str                                   # starts with Wniosek/Zgłoszenie/Deklaracja/Oświadczenie
  authority_name: str = ""                     # e.g. "Urząd Gminy X" / "Wójt Gminy Y"
  authority_kind: Literal["URZAD", "ORGAN"] = "URZAD"
  allows_other_person: bool = False
  allows_legal_entity: bool = False
  allows_proxy: bool = False
  pages: list[PageSpec]                        # subject-matter pages only; builder adds standard sections
  consents: list[str] = []                     # statements/consents found on the paper form


# --- D -> F -> API: result ---
FormDefinition = dict[str, Any]                # shape as in the reference JSONs; validated by block F


class RuleViolation(BaseModel):
  code: str
  message: str
  path: str = ""                               # e.g. "tabs[0].questions[2].field"


class ProposedDictionary(BaseModel):
  """A new dictionary suggested by block E (Słowniki: name, structure and use in the form; optional extension)."""
  name: str                                    # e.g. "RODZAJ_POJAZDU"
  values_example: list[str]                    # values found on the paper form
  used_by: list[str]                           # labels of the fields that would use it


class ConvertResult(BaseModel):
  form: FormDefinition
  warnings: list[str] = []
  proposed_dictionaries: list[ProposedDictionary] = []
