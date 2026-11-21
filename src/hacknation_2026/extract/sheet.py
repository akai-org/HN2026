"""Spreadsheet extraction (block B3): forms laid out in XLSX / ODS cells, one sheet = one page.

Fill-in places are not text in a spreadsheet: they are empty cells with borders. Every cell or merged range
becomes an item with its position (rows, column); items that overlap vertically form one visual line,
read left to right: text, bordered empty cells (input field -> `____`) and lone boxed cells (checkbox).
"""

import io
import zipfile
from typing import NamedTuple

import openpyxl
from lxml import etree

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import BOX, line_block

TEXT, FIELD, BOXED = "text", "field", "box"
MAX_LINE_ROWS = 6   # a taller merged cell does not pull later rows into its line


class Item(NamedTuple):
  top: int
  bottom: int
  left: int
  kind: str
  text: str = ""


def group_lines(items: list[Item]) -> list[list[Item]]:
  lines: list[list[Item]] = []
  line_bottom = -1
  for item in sorted(items, key=lambda i: (i.top, i.left)):
    if lines and item.top <= line_bottom:
      lines[-1].append(item)
    else:
      lines.append([item])
      line_bottom = min(item.bottom, item.top + MAX_LINE_ROWS - 1)
  return [sorted(line, key=lambda i: i.left) for line in lines]


def line_text(line: list[Item]) -> str:
  """Runs of bordered empty cells collapse into one `____`; a lone boxed cell right before text is a checkbox."""
  out, i = [], 0
  while i < len(line):
    if line[i].kind == TEXT:
      out.append(line[i].text)
      i += 1
      continue
    j = i
    while j < len(line) and line[j].kind != TEXT:
      j += 1
    out.append(BOX if j - i == 1 and line[i].kind == BOXED and j < len(line) else "____")
    i = j
  return " ".join(out)


def _blocks(items: list[Item], page: int) -> list[Block]:
  # shortcut: grid areas are emitted as lines, not table blocks; rows already read as "label ____ label ____".
  blocks: list[Block] = []
  for line in group_lines(items):
    block = line_block(line_text(line), page)
    if block and not (block.text == "____" and blocks and blocks[-1].text == "____"):
      blocks.append(block)
  return blocks


# ---------------------------------------------------------------- XLSX

def extract_xlsx(data: bytes) -> ExtractedDocument:
  try:
    workbook = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku XLSX", 422) from exc
  blocks: list[Block] = []
  sheets = [ws for ws in workbook.worksheets if ws.sheet_state == "visible"]
  for page, ws in enumerate(sheets, start=1):
    blocks += _blocks(_xlsx_items(ws), page)
  return ExtractedDocument(format=FileFormat.XLSX, blocks=blocks)


def _xlsx_items(ws) -> list[Item]:
  ranges = {(r.min_row, r.min_col): r for r in ws.merged_cells.ranges}
  covered = {(row, col) for r in ws.merged_cells.ranges
             for row in range(r.min_row, r.max_row + 1) for col in range(r.min_col, r.max_col + 1)} - set(ranges)
  items = []
  for row in ws.iter_rows():
    for cell in row:
      key = (cell.row, cell.column)
      if key in covered:
        continue
      merged = ranges.get(key)
      bottom = merged.max_row if merged else cell.row
      if cell.value not in (None, ""):
        items.append(Item(cell.row, bottom, cell.column, TEXT, " ".join(str(cell.value).split())))  # one line per cell
        continue
      border = cell.border
      sides = sum(bool(s and s.style) for s in (border.left, border.right, border.top, border.bottom))
      if merged and not sides:   # merged range: the outline may sit on its last row/column cells
        corner = ws.cell(merged.max_row, merged.max_col).border
        sides = sum(bool(s and s.style) for s in (corner.right, corner.bottom))
      if sides:
        items.append(Item(cell.row, bottom, cell.column, BOXED if sides == 4 and not merged else FIELD))
  return items


# ---------------------------------------------------------------- ODS

NS = {
  "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}


def _q(prefix: str, tag: str) -> str:
  return f"{{{NS[prefix]}}}{tag}"


def extract_ods(data: bytes) -> ExtractedDocument:
  try:
    root = etree.fromstring(zipfile.ZipFile(io.BytesIO(data)).read("content.xml"))
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku ODS", 422) from exc
  borders = _ods_border_counts(root)
  blocks: list[Block] = []
  for page, table in enumerate(root.iterfind(".//office:spreadsheet/table:table", NS), start=1):
    blocks += _blocks(_ods_items(table, borders), page)
  return ExtractedDocument(format=FileFormat.ODS, blocks=blocks)


def _ods_border_counts(root) -> dict[str, int]:
  """Cell style name -> number of bordered sides."""
  counts = {}
  for style in root.iterfind(".//office:automatic-styles/style:style", NS):
    props = style.find("style:table-cell-properties", NS)
    if props is None:
      continue
    name = style.get(_q("style", "name"))
    if (props.get(_q("fo", "border")) or "none") != "none":
      counts[name] = 4
    else:
      counts[name] = sum((props.get(_q("fo", f"border-{s}")) or "none") != "none" for s in ("left", "right", "top", "bottom"))
  return counts


def _ods_items(table, borders: dict[str, int]) -> list[Item]:
  items = []
  row_index = 0
  for row in table.iter(_q("table", "table-row")):
    row_repeat = int(row.get(_q("table", "number-rows-repeated"), "1"))
    col = 0
    for cell in row:
      repeat = int(cell.get(_q("table", "number-columns-repeated"), "1"))
      if cell.tag == _q("table", "table-cell"):
        bottom = row_index + int(cell.get(_q("table", "number-rows-spanned"), "1")) - 1
        merged = int(cell.get(_q("table", "number-columns-spanned"), "1")) > 1 or bottom > row_index
        text = " ".join("".join(p.itertext()).strip() for p in cell.iterfind("text:p", NS)).strip()
        sides = borders.get(cell.get(_q("table", "style-name")), 0)
        if text:
          items.append(Item(row_index, bottom, col, TEXT, text))
        elif sides:
          kind = BOXED if sides == 4 and not merged else FIELD
          items += [Item(row_index, bottom, col + k, kind) for k in range(min(repeat, 2))]  # 2 is enough for a run
      col += repeat
    row_index += row_repeat   # repeated rows are empty filler in real forms; only their count matters
  return items
