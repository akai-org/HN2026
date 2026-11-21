"""PDF extraction (block B1): text layer via pdfplumber, OCR fallback for scanned pages."""

import io

import pdfplumber
import pypdfium2

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import BOX, line_block, normalize
from hacknation_2026.extract.image import ocr_blocks

MIN_PAGE_CHARS = 10        # fewer characters than this = scanned page, OCR it
OCR_DPI = 300


def extract_pdf(data: bytes, lang: str = "pol") -> ExtractedDocument:
  blocks: list[Block] = []
  try:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
      for number, page in enumerate(pdf.pages, start=1):
        if len(page.chars) < MIN_PAGE_CHARS:
          blocks += ocr_blocks(_render(data, number - 1), number, lang)
        else:
          blocks += _page_blocks(page, number)
  except AppError:
    raise
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku PDF", 422) from exc
  return ExtractedDocument(format=FileFormat.PDF, blocks=blocks)


def _render(data: bytes, index: int):
  return pypdfium2.PdfDocument(data)[index].render(scale=OCR_DPI / 72).to_pil().convert("L")


def _page_blocks(page, number: int) -> list[Block]:
  tables = page.find_tables()
  items: list[tuple[float, Block]] = []
  for table in tables:
    # shortcut: checkboxes drawn inside table cells are not marked; the numbered options stay as text.
    rows = [[normalize(cell or "").replace(BOX, "[ ]") for cell in row] for row in table.extract()]
    rows = [row for row in rows if any(row)]
    if rows:
      items.append((table.bbox[1], Block(kind="table", rows=rows, page=number)))

  squares = [r for r in page.rects if 5 < r["width"] < 15 and abs(r["width"] - r["height"]) < 1.5]
  for line in page.extract_text_lines(return_chars=True):
    cx, cy = (line["x0"] + line["x1"]) / 2, (line["top"] + line["bottom"]) / 2
    if any(x0 <= cx <= x1 and top <= cy <= bottom for x0, top, x1, bottom in (t.bbox for t in tables)):
      continue
    block = line_block(_line_text(line, squares), number)
    if block:
      items.append((line["top"], block))

  items.sort(key=lambda item: item[0])
  return [block for _, block in items]


def _line_text(line: dict, squares: list[dict]) -> str:
  """Line text; drawn checkbox squares on the same row are inserted at their x position."""
  cy = (line["top"] + line["bottom"]) / 2
  boxes = [(s["x0"], s["x1"], BOX) for s in squares
           if abs((s["top"] + s["bottom"]) / 2 - cy) < 6 and s["x0"] < line["x1"] + 20]
  if not boxes:
    return line["text"]
  tokens = sorted([(c["x0"], c["x1"], c["text"]) for c in line["chars"]] + boxes)
  out, prev_x1 = [], None
  for x0, x1, text in tokens:
    if prev_x1 is not None and x0 - prev_x1 > 1.5:   # pdfplumber's own word gap is ~3 pt
      out.append(" ")
    out.append(text)
    prev_x1 = x1
  return "".join(out)
