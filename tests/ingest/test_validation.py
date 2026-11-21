import io
import pathlib
import zipfile

import pytest

from hacknation_2026.contracts import AppError, FileFormat
from hacknation_2026.ingest.validation import validate_upload

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
SAMPLES = sorted(p for p in BLANKIETY.rglob("*") if p.is_file() and p.suffix.lower() != ".json")
LIMIT = 50 * 1024 * 1024
PDF = b"%PDF-1.7\n..."


def expect_error(code: str, status: int, filename: str, data: bytes, limit: int = LIMIT):
  with pytest.raises(AppError) as exc:
    validate_upload(filename, data, limit)
  assert (exc.value.code, exc.value.status) == (code, status)


def make_zip(files: dict[str, bytes]) -> bytes:
  buf = io.BytesIO()
  with zipfile.ZipFile(buf, "w") as archive:
    for name, content in files.items():
      archive.writestr(name, content)
  return buf.getvalue()


def test_samples_found():
  assert len(SAMPLES) > 60


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: f"{p.parent.name[:2]}{p.name[-6:]}")
def test_blankiety(path):
  ext = path.suffix.lower()
  if ext == ".jpe":  # not in the allowed extension list
    expect_error("UNSUPPORTED_FORMAT", 415, path.name, path.read_bytes())
    return
  fmt = validate_upload(path.name, path.read_bytes(), LIMIT)
  expected = {".pdf": {FileFormat.PDF}, ".png": {FileFormat.PNG}, ".jpg": {FileFormat.JPEG},
              ".jpeg": {FileFormat.JPEG}, ".ods": {FileFormat.ODS}, ".xlsx": {FileFormat.XLSX},
              ".doc": {FileFormat.DOC, FileFormat.DOCX}, ".docx": {FileFormat.DOCX}}[ext]
  assert fmt in expected


def test_doc_extension_with_docx_content_reports_real_content():
  doc_as_docx = next(p for p in SAMPLES if p.suffix == ".DOC")
  assert validate_upload(doc_as_docx.name, doc_as_docx.read_bytes(), LIMIT) == FileFormat.DOCX


def test_extension_is_case_insensitive():
  assert validate_upload("WNIOSEK.PdF", PDF, LIMIT) == FileFormat.PDF


@pytest.mark.parametrize("name", ["", "   ", "a" * 247 + ".pdf", *(f"wn{c}iosek.pdf" for c in ";:></\\|'*%$")])
def test_invalid_filename(name):
  expect_error("INVALID_FILENAME", 422, name, PDF)


def test_filename_of_exactly_250_chars_is_ok():
  assert validate_upload("a" * 246 + ".pdf", PDF, LIMIT) == FileFormat.PDF


@pytest.mark.parametrize("name", ["wniosek", "wniosek.txt", "wniosek.xls", "wniosek.pdf.exe"])
def test_unsupported_extension(name):
  expect_error("UNSUPPORTED_FORMAT", 415, name, PDF)


def test_too_large():
  expect_error("FILE_TOO_LARGE", 413, "wniosek.pdf", PDF, limit=len(PDF) - 1)
  assert validate_upload("wniosek.pdf", PDF, len(PDF)) == FileFormat.PDF


@pytest.mark.parametrize("name,data", [
  ("wniosek.png", PDF),                                                            # PDF renamed to .png
  ("wniosek.pdf", b""),                                                            # empty file
  ("wniosek.pdf", b"Ala ma kota"),                                                 # plain text
  ("wniosek.xlsx", make_zip({"[Content_Types].xml": b"", "word/document.xml": b""})),  # DOCX as .xlsx
  ("wniosek.docx", make_zip({"cokolwiek.txt": b"x"})),                             # unrelated ZIP
  ("wniosek.docx", b"PK\x03\x04 zepsuty zip"),                                     # broken ZIP
  ("wniosek.ods", make_zip({"mimetype": b"application/vnd.oasis.opendocument.text"})),  # ODT, not ODS
])
def test_mime_mismatch(name, data):
  expect_error("MIME_MISMATCH", 415, name, data)
