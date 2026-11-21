"""Upload validation (block A): filename, size and content type matching the extension."""

import io
import zipfile

from hacknation_2026.contracts import AppError, FileFormat

MAX_FILENAME_LENGTH = 250
FORBIDDEN_FILENAME_CHARS = set(";:><\\/|'*%$")

# Extension -> content formats it may hold. .doc/.docx are one family: real .DOC files carry DOCX content.
ALLOWED: dict[str, set[FileFormat]] = {
  "pdf": {FileFormat.PDF},
  "doc": {FileFormat.DOC, FileFormat.DOCX},
  "docx": {FileFormat.DOC, FileFormat.DOCX},
  "ods": {FileFormat.ODS},
  "xlsx": {FileFormat.XLSX},
  "jpg": {FileFormat.JPEG},
  "jpeg": {FileFormat.JPEG},
  "png": {FileFormat.PNG},
}

ODS_MIMETYPE = b"application/vnd.oasis.opendocument.spreadsheet"


def validate_upload(filename: str, data: bytes, max_size_bytes: int) -> FileFormat:
  _check_filename(filename)
  extension = filename.rsplit(".", 1)[1].lower() if "." in filename else ""
  if extension not in ALLOWED:
    raise AppError("UNSUPPORTED_FORMAT", f"Nieobsługiwany format pliku: .{extension}", 415)
  if len(data) > max_size_bytes:
    raise AppError("FILE_TOO_LARGE", f"Plik przekracza limit {max_size_bytes} bajtów", 413)
  detected = detect_format(data)
  if detected not in ALLOWED[extension]:
    raise AppError("MIME_MISMATCH", f"Zawartość pliku nie odpowiada rozszerzeniu .{extension}", 415)
  return detected


def _check_filename(filename: str) -> None:
  if not filename or not filename.strip():
    raise AppError("INVALID_FILENAME", "Brak nazwy pliku", 422)
  if len(filename) > MAX_FILENAME_LENGTH:
    raise AppError("INVALID_FILENAME", f"Nazwa pliku przekracza {MAX_FILENAME_LENGTH} znaków", 422)
  bad = sorted(FORBIDDEN_FILENAME_CHARS.intersection(filename))
  if bad:
    raise AppError("INVALID_FILENAME", f"Nazwa pliku zawiera niedozwolone znaki: {' '.join(bad)}", 422)


def detect_format(data: bytes) -> FileFormat | None:
  """Format from magic bytes; None when the content is none of the supported formats."""
  if data.startswith(b"%PDF"):
    return FileFormat.PDF
  if data.startswith(b"\x89PNG\r\n\x1a\n"):
    return FileFormat.PNG
  if data.startswith(b"\xff\xd8\xff"):
    return FileFormat.JPEG
  # shortcut: any OLE2 container counts as DOC (also .xls/.msi); check the WordDocument stream if that matters.
  if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
    return FileFormat.DOC
  if data.startswith(b"PK\x03\x04"):
    return _detect_zip(data)
  return None


def _detect_zip(data: bytes) -> FileFormat | None:
  try:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
      names = set(archive.namelist())
      if "mimetype" in names and archive.read("mimetype").strip() == ODS_MIMETYPE:
        return FileFormat.ODS
  except (zipfile.BadZipFile, KeyError):
    return None
  if "[Content_Types].xml" in names:
    if "word/document.xml" in names:
      return FileFormat.DOCX
    if "xl/workbook.xml" in names:
      return FileFormat.XLSX
  return None
