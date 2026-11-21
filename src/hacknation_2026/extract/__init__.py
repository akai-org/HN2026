"""Picks the extractor for a detected file format (blocks B1-B3)."""

from hacknation_2026.contracts import ExtractedDocument, FileFormat
from hacknation_2026.extract.image import extract_image
from hacknation_2026.extract.pdf import extract_pdf
from hacknation_2026.extract.sheet import extract_ods, extract_xlsx
from hacknation_2026.extract.word import extract_doc, extract_docx


def extract_document(data: bytes, fmt: FileFormat, ocr_lang: str = "pol") -> ExtractedDocument:
  match fmt:
    case FileFormat.PDF:
      return extract_pdf(data, lang=ocr_lang)
    case FileFormat.JPEG | FileFormat.PNG:
      return extract_image(data, fmt, lang=ocr_lang)
    case FileFormat.DOC:
      return extract_doc(data)
    case FileFormat.DOCX:
      return extract_docx(data)
    case FileFormat.XLSX:
      return extract_xlsx(data)
    case FileFormat.ODS:
      return extract_ods(data)
  raise ValueError(f"Nieobsługiwany format: {fmt}")
