"""PDF extraction (block B1): text layer via pdfplumber, OCR fallback for scanned pages."""

import io

import numpy as np
import pdfplumber
import pypdfium2
from PIL import Image, ImageDraw

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import BOX, line_block, normalize
from hacknation_2026.extract.fields import BOX as BOX_MARK, FIELD, Mark, detect_marks
from hacknation_2026.extract.image import ocr_blocks

MIN_PAGE_CHARS = 10        # fewer characters than this = scanned page, OCR it
OCR_DPI = 300
MARK_DPI = 150      # enough to see 2 mm checkboxes and dotted lines in the rendered vector graphics


def extract_pdf(data: bytes, lang: str = "pol") -> ExtractedDocument:
  blocks: list[Block] = []
  try:
    document = pypdfium2.PdfDocument(data)
    with pdfplumber.open(io.BytesIO(data)) as pdf:
      for number, page in enumerate(pdf.pages, start=1):
        if len(page.chars) < MIN_PAGE_CHARS:
          blocks += ocr_blocks(_render(document[number - 1], OCR_DPI), number, lang)
        else:
          blocks += _page_blocks(page, number, _vector_marks(page, document[number - 1]))
  except AppError:
    raise
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku PDF", 422) from exc
  return ExtractedDocument(format=FileFormat.PDF, blocks=blocks)


def _render(page, dpi: int) -> Image.Image:
  return page.render(scale=dpi / 72).to_pil().convert("L")


def _vector_marks(page, rendered_page) -> list[Mark]:
  """Blank lines, frames and checkboxes drawn as graphics, in PDF points. Text is painted out first:
  dotted fill-ins and glyph checkboxes written as characters are already handled by the text itself."""
  image = _render(rendered_page, MARK_DPI)
  scale = MARK_DPI / 72
  draw = ImageDraw.Draw(image)
  for char in page.chars:
    draw.rectangle([char["x0"] * scale - 1, char["top"] * scale - 1, char["x1"] * scale + 1, char["bottom"] * scale + 1], fill=255)
  marks = detect_marks(np.array(image), page_width_mm=float(page.width) / 72 * 25.4)
  return [Mark(m.kind, m.x0 / scale, m.y0 / scale, m.x1 / scale, m.y1 / scale) for m in marks]


def _page_blocks(page, number: int, marks: list[Mark]) -> list[Block]:
  tables = page.find_tables()
  table_boxes = [t.bbox for t in tables]
  inside = lambda box, x, y: box[0] <= x <= box[2] and box[1] <= y <= box[3]
  in_table = lambda x, y: any(inside(box, x, y) for box in table_boxes)
  all_lines = page.extract_text_lines(return_chars=True)
  items: list[tuple[float, Block]] = []

  for table in tables:
    rows = []
    for row in table.rows:
      # empty cells of a layout grid carry nothing; a cell with a drawn blank line reads as "____"
      cells = [text for text in (_region_text(all_lines, marks, cell) if cell else "" for cell in row.cells) if text]
      if cells:
        rows.append(_collapse_blanks(cells))
    if not rows:
      # a grid with no text at all is a row of character boxes (NIP, PESEL, postcode): one place to write
      items.append((table.bbox[1], Block(kind="text", text="____", page=number)))
    else:
      items.append((table.bbox[1], Block(kind="table", rows=rows, page=number)))

  free_marks = [m for m in marks if not in_table((m.x0 + m.x1) / 2, m.cy)]
  lines = [line for line in all_lines if not in_table((line["x0"] + line["x1"]) / 2, (line["top"] + line["bottom"]) / 2)]
  assigned = _assign_marks(lines, free_marks)
  for index, line in enumerate(lines):
    block = line_block(_line_text(line, assigned.get(index, [])), number)
    if block:
      items.append((line["top"], block))
  used = {id(m) for group in assigned.values() for m in group}
  for mark in free_marks:
    if id(mark) not in used:   # a blank line or box with no text on its row
      items.append((mark.y0, Block(kind="text", text="____" if mark.kind == FIELD else "[ ]", page=number)))

  items.sort(key=lambda item: item[0])
  return [block for _, block in items]


def _region_text(lines: list[dict], marks: list[Mark], box: tuple) -> str:
  """Text of a table cell with the blank lines and checkboxes drawn in it; an empty cell with a mark is a field."""
  inside = lambda x, y: box[0] <= x <= box[2] and box[1] <= y <= box[3]
  cell_lines = [dict(line, chars=[c for c in line["chars"] if inside((c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2)])
                for line in lines if inside((line["x0"] + line["x1"]) / 2, (line["top"] + line["bottom"]) / 2)
                or any(inside((c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2) for c in line["chars"])]
  cell_lines = [dict(line, text=_chars_text(line["chars"])) for line in cell_lines if line["chars"]]
  cell_marks = [m for m in marks if inside((m.x0 + m.x1) / 2, m.cy)]
  if not cell_lines:
    return "____" if any(m.kind == FIELD for m in cell_marks) else ""
  assigned = _assign_marks(cell_lines, cell_marks)
  text = " ".join(_line_text(line, assigned.get(i, [])) for i, line in enumerate(cell_lines))
  return normalize(text).replace(BOX, "[ ]")


def _collapse_blanks(row: list[str]) -> list[str]:
  out: list[str] = []
  for cell in row:
    if not (cell == "____" and out and out[-1] == "____"):
      out.append(cell)
  return out


def _assign_marks(lines: list[dict], marks: list[Mark]) -> dict[int, list[Mark]]:
  """Each mark joins the text line on its row: a checkbox beside the text, a blank line on or just under the baseline."""
  assigned: dict[int, list[Mark]] = {}
  for mark in marks:
    best, best_distance = None, None
    for index, line in enumerate(lines):
      height = line["bottom"] - line["top"]
      low = line["bottom"] + (0.5 * height if mark.kind == FIELD else 0)
      if line["top"] <= mark.cy <= low or abs(mark.cy - (line["top"] + line["bottom"]) / 2) < 0.6 * height:
        distance = abs(mark.cy - (line["top"] + line["bottom"]) / 2)
        if best_distance is None or distance < best_distance:
          best, best_distance = index, distance
    if best is not None:
      assigned.setdefault(best, []).append(mark)
  return assigned


def _line_text(line: dict, marks: list[Mark]) -> str:
  """Line text with the marks of its row inserted at their x position."""
  if not marks:
    return line["text"]
  return _chars_text(line["chars"], [(m.x0, m.x1, BOX if m.kind == BOX_MARK else " ____ ") for m in marks])


def _chars_text(chars: list[dict], extra: list[tuple] = ()) -> str:
  """Text from positioned characters (and extra tokens); pdfplumber stores no space characters, gaps become spaces."""
  tokens = sorted([(c["x0"], c["x1"], c["text"]) for c in chars] + list(extra))
  out, prev_x1 = [], None
  for x0, x1, text in tokens:
    if prev_x1 is not None and x0 - prev_x1 > 1.5:   # pdfplumber's own word gap is ~3 pt
      out.append(" ")
    out.append(text)
    prev_x1 = max(prev_x1 or x1, x1)
  return "".join(out)
