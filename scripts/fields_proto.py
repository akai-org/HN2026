"""Prototype field detectors (design stage, see docs/wykrywanie-pol.md). Not application code.

One geometric vocabulary for every source: an Item is a place to fill in (`field`) or a box to tick (`checkbox`)
with a bbox in PDF points. Detectors:
- pdf_vector(path):  text layer + vector graphics of a PDF (used as the reference for images, Word and sheets),
- image_raster(img): OpenCV on a page image (scans, photos, or a rendered PDF page).
Both share the same primitive: rectangular holes in a mask of lines -> cells -> classified into
checkbox / comb (letter boxes) / empty box / label cell.
"""

import io
import math
import re

import cv2
import numpy as np
import pdfplumber
import pytesseract
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
FIELD, CHECKBOX = "field", "checkbox"
BOX_CHARS = "❑☐□"   # + Wingdings/Symbol private-use glyphs, same set as extract/_text.py
FILL_CHARS = "._…·"
A4_RATIO = 297 / 210


def item(kind, page, x0, top, x1, bottom, via, anchor=None):
  """anchor: (x, top, bottom) where the marker sits in reading order; default = its own bbox."""
  return {"kind": kind, "page": page, "bbox": [x0, top, x1, bottom], "via": via, "anchor": anchor}


# ---------------------------------------------------------------- cells from a line mask (shared)

def mask_cells(mask: np.ndarray, min_px: int) -> list[tuple[int, int, int, int]]:
  """Rectangular regions enclosed by lines: connected components of the background that do not touch the border."""
  n, _, stats, _ = cv2.connectedComponentsWithStats((mask == 0).astype(np.uint8), connectivity=4)
  h_img, w_img = mask.shape
  cells = []
  for x, y, w, h, area in stats[1:]:
    if x == 0 or y == 0 or x + w >= w_img or y + h >= h_img or w < min_px or h < min_px:
      continue
    if area / (w * h) >= 0.85:
      cells.append((x, y, x + w, y + h))
  return cells


def is_cell_edge(x0, x1, y, cells, tol) -> bool:
  """A horizontal stroke is a border when cell tops/bottoms at its height cover most of its length."""
  cover = sum(max(0, min(x1, c[2]) - max(x0, c[0])) for c in cells if abs(y - c[1]) < tol or abs(y - c[3]) < tol)
  return cover >= 0.5 * (x1 - x0)


def classify_cells(cells, content, page, shaded=lambda c: False):
  """cells in pt; content(cell) -> list of (x0, top, x1, bottom) text/ink boxes inside the cell.

  A row of small empty cells = comb (letter boxes, one field); a lone small empty square = checkbox;
  empty larger cell = field; cell with a label only at its top and blank space below = field after the label.
  Cells that contain other cells are frames and are skipped; shaded empty cells are not for filling.
  """
  def contains(outer, inner):
    return outer is not inner and outer[0] - 1 <= inner[0] and inner[2] <= outer[2] + 1 and outer[1] - 1 <= inner[1] and inner[3] <= outer[3] + 1

  items, smalls = [], []
  for c in cells:
    x0, top, x1, bottom = c
    w, h = x1 - x0, bottom - top
    if any(contains(c, o) for o in cells):
      continue
    inside = content(c)
    if not inside and 3 <= w <= 30 and 3 <= h <= 36 and 0.45 <= w / h <= 1.8:
      smalls.append(c)
    elif not inside:
      if w >= 15 and h >= 8 and not shaded(c):
        items.append(item(FIELD, page, *c, "empty-cell"))
    else:
      tail = [t for t in inside if t[1] > top + 0.6 * h]
      if 0 < len(tail) <= 3 and len(tail) < len(inside):
        inside = [t for t in inside if t not in tail]        # unit at the bottom of the cell, e.g. "zł"
      first_top = min(t[1] for t in inside)
      label_bottom = max(t[3] for t in inside)
      first_line = [t for t in inside if t[1] < first_top + 4]
      if first_top - top <= max(6, 0.25 * h) and bottom - label_bottom >= 10 and label_bottom - top <= 0.5 * h and w >= 40 and not shaded(c):
        lx = max(t[2] for t in first_line)
        items.append(item(FIELD, page, *c, "label-cell", anchor=(lx + 0.5, first_top, first_top + 6)))
  # comb grouping: same row, touching or nearly (date separators "-" allowed up to 22 pt)
  smalls.sort(key=lambda c: (round(c[1] / 3), c[0]))
  groups: list[list] = []
  for c in smalls:
    g = groups[-1] if groups else None
    if g and abs(c[1] - g[-1][1]) < 3 and abs(c[3] - g[-1][3]) < 3 and -1 <= c[0] - g[-1][2] <= 22:
      g.append(c)
    else:
      groups.append([c])
  for g in groups:
    x0, top, x1, bottom = g[0]
    if len(g) > 1:
      items.append(item(FIELD, page, x0, min(c[1] for c in g), g[-1][2], max(c[3] for c in g), f"comb{len(g)}"))
    elif 3 <= x1 - x0 <= 24 and 3 <= bottom - top <= 24 and 0.6 <= (x1 - x0) / (bottom - top) <= 1.6:
      items.append(item(CHECKBOX, page, *g[0], "square"))
    elif x1 - x0 >= 15 and not shaded(g[0]):
      items.append(item(FIELD, page, *g[0], "empty-cell"))
  return items


# ---------------------------------------------------------------- PDF (vector + text layer)

def _lum(color) -> float:
  if color is None:
    return 0.0
  if isinstance(color, (int, float)):
    return float(color)
  color = list(color)
  if len(color) == 1:
    return color[0]
  if len(color) == 3:
    return 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2]
  if len(color) == 4:
    c, m, y, k = color
    return 1 - min(1, 0.3 * c + 0.59 * m + 0.11 * y + k)
  return 0.0


def _box_glyph(ch: str) -> bool:
  return ch in BOX_CHARS or ch in ""


def pdf_vector(path) -> list[dict]:
  """-> pages: {"width", "height", "items", "tokens"}; tokens are (x0, top, x1, bottom, text) incl. markers."""
  pages = []
  with pdfplumber.open(path) as pdf:
    for number, page in enumerate(pdf.pages, start=1):
      pages.append(_pdf_page(page, number))
  return pages


def _pdf_page(page, number):
  S = 4
  W, H = float(page.width), float(page.height)
  mask = np.zeros((int(H * S) + 2, int(W * S) + 2), np.uint8)
  segments = []   # horizontal dark segments (x0, x1, y) for underline detection

  def line(x0, y0, x1, y1, width):
    t = max(1, round(width * S))
    cv2.line(mask, (round(x0 * S), round(y0 * S)), (round(x1 * S), round(y1 * S)), 255, t)
    if abs(y0 - y1) < 1 and abs(x1 - x0) >= 30 and width <= 1.5:
      segments.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2))

  for r in page.rects:
    x0, top, x1, bottom = r["x0"], r["top"], r["x1"], r["bottom"]
    w, h = x1 - x0, bottom - top
    if r.get("fill") and _lum(r.get("non_stroking_color")) < 0.5 and min(w, h) <= 3.5:
      if w >= h:
        line(x0, (top + bottom) / 2, x1, (top + bottom) / 2, max(h, 0.3))
      else:
        line((x0 + x1) / 2, top, (x0 + x1) / 2, bottom, max(w, 0.3))
    elif r.get("stroke") and _lum(r.get("stroking_color")) < 0.5:
      lw = r.get("linewidth") or 0.5
      for a, b in (((x0, top), (x1, top)), ((x1, top), (x1, bottom)), ((x1, bottom), (x0, bottom)), ((x0, bottom), (x0, top))):
        line(*a, *b, lw)
  for ln in page.lines:
    if _lum(ln.get("stroking_color")) < 0.5:
      line(ln["x0"], ln["top"], ln["x1"], ln["bottom"], ln.get("linewidth") or 0.5)
  for cv in page.curves:
    if cv.get("stroke") and _lum(cv.get("stroking_color")) < 0.5:
      pts = cv["pts"]
      for a, b in zip(pts, pts[1:]):
        line(*a, *b, cv.get("linewidth") or 0.5)

  # text tokens: runs of normal chars, runs of fill chars (-> field), box glyphs (-> checkbox)
  tokens, items = [], []
  chars = [c for c in page.chars if c["text"].strip()]
  for ln in page.extract_text_lines(return_chars=True):
    run, kind = [], None

    def flush():
      if not run:
        return
      x0, x1 = run[0]["x0"], run[-1]["x1"]
      top, bottom = min(c["top"] for c in run), max(c["bottom"] for c in run)
      if kind == "fill":
        n = sum(3 if c["text"] == "…" else 1 for c in run)
        if n >= 4 and x1 - x0 >= 10:
          items.append(item(FIELD, number, x0, top, x1, bottom, "dots"))
          return
      text = "".join(c["text"] for c in run)
      if tokens and 0 <= x0 - tokens[-1][2] < 1.5 and abs(top - tokens[-1][1]) < 3:   # "art." stays one word
        t = tokens.pop()
        tokens.append((t[0], min(t[1], top), x1, max(t[3], bottom), t[4] + text))
      else:
        tokens.append((x0, top, x1, bottom, text))

    prev = None
    for c in ln["chars"]:
      ch = c["text"]
      if _box_glyph(ch):
        flush()
        run, kind = [], None
        items.append(item(CHECKBOX, number, c["x0"], c["top"], c["x1"], c["bottom"], "glyph"))
        prev = c
        continue
      k = "fill" if ch in FILL_CHARS else ("space" if not ch.strip() else "text")
      if k == "space":
        prev = c
        continue
      gap = c["x0"] - prev["x1"] if prev else 0
      if k != kind or gap > 3 * max(1.0, c["size"] / 4):
        if not (k == kind == "text" and gap <= 3 * max(1.0, c["size"] / 4)):
          flush()
          run = []
        kind = k
      if run and k == "text" and gap > 1.2:
        run.append({**c, "text": " " + ch})
      else:
        run.append(c)
      prev = c
    flush()

  # cells from vector lines
  raw = mask_cells(mask, min_px=3 * S)
  cells = [(x0 / S, y0 / S, x1 / S, y1 / S) for x0, y0, x1, y1 in raw]
  fill_boxes = [it["bbox"] for it in items if it["via"] == "dots"]

  def content(cell):
    x0, top, x1, bottom = cell
    if any(x0 - 1 <= (b[0] + b[2]) / 2 <= x1 + 1 and top - 1 <= (b[1] + b[3]) / 2 <= bottom + 1 for b in fill_boxes):
      return [cell]   # holds a dotted field: neither empty nor a label cell
    return [(c["x0"], c["top"], c["x1"], c["bottom"]) for c in chars if c["text"].isalnum()
            and _lum(c.get("non_stroking_color")) < 0.6          # light-grey letters are placeholders (DD-MM-RRRR)
            and x0 <= (c["x0"] + c["x1"]) / 2 <= x1 and top <= (c["top"] + c["bottom"]) / 2 <= bottom]

  shades = [r for r in page.rects if r.get("fill") and 0.5 <= _lum(r.get("non_stroking_color")) < 0.97 and min(r["width"], r["height"]) > 4]

  def shaded(cell):
    x0, top, x1, bottom = cell
    return any(r["x0"] <= x0 + 2 and r["x1"] >= x1 - 2 and r["top"] <= top + 2 and r["bottom"] >= bottom - 2 for r in shades)

  items += classify_cells(cells, content, number, shaded)

  # underlines not belonging to cells, with nothing written on them
  for x0, x1, y in segments:
    if is_cell_edge(x0, x1, y, cells, 2.5):
      continue
    if any(x0 < (c["x0"] + c["x1"]) / 2 < x1 and y - 14 < c["bottom"] <= y + 1.5 for c in chars):
      continue
    if y > 0.85 * H:
      continue   # footnote separator / footer rule
    ends = [mask[max(0, round((y - 6) * S)):round((y + 6) * S), max(0, round(x * S) - 8):round(x * S) + 8] for x in (x0, x1)]
    if any((e > 0).all(axis=1).sum() == 0 and (e > 0).any(axis=0).any() and ((e > 0).sum(axis=0) >= 6 * S).any() for e in ends):
      continue   # a vertical line meets the end: table / frame border, not an underline
    items.append(item(FIELD, number, x0, y - 10, x1, y, "underline"))
  return {"width": W, "height": H, "items": items, "tokens": tokens}


# ---------------------------------------------------------------- image (OpenCV)

def split_pages(image: Image.Image) -> list[Image.Image]:
  page_height = round(image.width * A4_RATIO)
  count = max(1, math.ceil(image.height / page_height - 0.1))
  return [image.crop((0, i * page_height, image.width, min(image.height, (i + 1) * page_height))) for i in range(count)]


def image_raster(gray: np.ndarray, page: int, dpi: float) -> list[dict]:
  """Items (bbox in pt) found on one page image. gray: uint8, white paper."""
  k = dpi / 72                                    # px per pt
  ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 15)
  items = []

  # 1. lines: long horizontal / vertical strokes
  hl = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(10, round(12 * k)), 1)))
  vl = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(8, round(7 * k)))))
  lines = cv2.bitwise_or(hl, vl)
  lines = cv2.dilate(lines, np.ones((3, 3), np.uint8))   # close 1-px gaps at corners

  # 2. small closed squares straight from ink (checkbox glyphs, comb cells with thin walls)
  _, ink_closed = cv2.threshold(ink, 0, 255, cv2.THRESH_BINARY)
  contours, hier = cv2.findContours(ink_closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
  holes = []
  if hier is not None:
    for cnt, h in zip(contours, hier[0]):
      if h[3] < 0:
        continue                                    # outer contour, we want holes
      x, y, w, hh = cv2.boundingRect(cnt)
      if 3 * k <= w <= 24 * k and 3 * k <= hh <= 24 * k and 0.6 <= w / hh <= 1.6 and cv2.contourArea(cnt) / (w * hh) >= 0.75 \
          and len(cv2.approxPolyDP(cnt, 0.1 * cv2.arcLength(cnt, True), True)) == 4:
        px, py, pw, ph = cv2.boundingRect(contours[h[3]])
        gap = max(2, round(1.2 * k))
        side = np.concatenate([ink[py:py + ph, max(0, px - gap):px], ink[py:py + ph, px + pw:px + pw + gap]], axis=1)
        # thin square ring standing apart from neighbours (a box glyph is followed by a space; a letter like D is not)
        filled = np.zeros((hh, w), np.uint8)
        cv2.drawContours(filled, [cnt - [x, y]], -1, 1, -1)
        corners = filled[[1, 1, -2, -2], [1, -2, 1, -2]].all()   # square corners; D, O, 0 have rounded ones
        if (w * hh) / (pw * ph) >= 0.5 and 0.7 <= pw / ph <= 1.4 and not side.any() and corners:
          holes.append((x, y, x + w, y + hh))
  cells_px = mask_cells(lines, min_px=round(3 * k))
  for hb in holes:                                  # add square holes not already a cell
    if not any(abs(hb[0] - c[0]) < 4 and abs(hb[1] - c[1]) < 4 for c in cells_px):
      cells_px.append(hb)

  # ink boxes (text) per cell: connected components of ink minus lines
  text_ink = cv2.bitwise_and(ink, cv2.bitwise_not(lines))
  text_ink[gray > 160] = 0          # light-grey print (placeholders like DD-MM-RRRR) is not content
  n, _, stats, _ = cv2.connectedComponentsWithStats(text_ink, connectivity=8)
  blobs = [(x, y, x + w, y + h) for x, y, w, h, a in stats[1:] if a >= 4 and max(w, h) >= 3]
  blobs_arr = np.array(blobs) if blobs else np.zeros((0, 4))

  def content(cell):
    x0, top, x1, bottom = (v * k for v in cell)
    m = 2
    if not len(blobs_arr):
      return []
    sel = blobs_arr[(blobs_arr[:, 0] >= x0 + m) & (blobs_arr[:, 2] <= x1 - m) & (blobs_arr[:, 1] >= top + m) & (blobs_arr[:, 3] <= bottom - m)]
    return [tuple(v / k for v in b) for b in sel]

  background = float(np.median(gray))

  def shaded(cell):
    x0, top, x1, bottom = (round(v * k) for v in cell)
    inner = gray[top + 3:bottom - 3, x0 + 3:x1 - 3]
    return inner.size > 0 and float(np.median(inner)) < background - 15

  cells = [tuple(v / k for v in c) for c in cells_px]
  items += classify_cells(cells, content, page, shaded)

  # 3. dotted lines: rows of dot-sized blobs
  dot_max = max(2, round(2.2 * k))
  dots = np.zeros_like(ink)
  for x, y, w, h, a in stats[1:]:
    if w <= dot_max and h <= dot_max and a >= 1:
      dots[y:y + h, x:x + w] = 255
  joined = cv2.dilate(dots, cv2.getStructuringElement(cv2.MORPH_RECT, (max(5, round(5 * k)), 1)))
  n2, lab2, st2, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
  for x, y, w, h, a in st2[1:]:
    if w >= 20 * k and h <= 4.5 * k + 0.02 * w:   # shortcut: tolerates ~1 deg skew; deskew scans if worse
      count = cv2.connectedComponents(dots[y:y + h, x:x + w])[0] - 1
      if count >= 5:
        items.append(item(FIELD, page, x / k, (y - 6 * k) / k, (x + w) / k, (y + h) / k, "dots"))

  # 4. underlines: horizontal strokes that are not cell borders and have no text right on top
  cell_edges = [c for c in cells_px]
  n3, _, st3, _ = cv2.connectedComponentsWithStats(hl, connectivity=8)
  for x, y, w, h, a in st3[1:]:
    if w < 25 * k or h > 3 * k:
      continue
    if is_cell_edge(x, x + w, y, cell_edges, 3 * k) or y > 0.85 * gray.shape[0]:
      continue   # border, or footnote separator / footer rule
    ends = [vl[max(0, y - round(6 * k)):y + round(6 * k), max(0, xe - 6):xe + 6] for xe in (x, x + w)]
    if any((e > 0).any() for e in ends):
      continue   # a vertical stroke meets the end: frame border
    region = text_ink[max(0, y - round(10 * k)):max(0, y - 1), x:x + w]
    if region.size and (region > 0).mean() > 0.01:
      continue
    items.append(item(FIELD, page, x / k, y / k - 10, (x + w) / k, y / k, "underline"))
  return items


def ocr_tokens(gray: np.ndarray, page: int, dpi: float, items: list[dict], lang="pol") -> list[tuple]:
  """Tesseract words (pt) minus words that are really detected fields (dots read as text)."""
  k = dpi / 72
  d = pytesseract.image_to_data(Image.fromarray(gray), lang=lang, config="--psm 11", output_type=pytesseract.Output.DICT)
  out = []
  for word, conf, left, top, w, h in zip(d["text"], d["conf"], d["left"], d["top"], d["width"], d["height"]):
    if not word.strip():
      continue
    b = (left / k, top / k, (left + w) / k, (top + h) / k)
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    if any(it["bbox"][0] - 1 <= cx <= it["bbox"][2] + 1 and it["bbox"][1] - 1 <= cy <= it["bbox"][3] + 1
           for it in items if it["via"] in ("dots", "underline") or it["via"].startswith("comb") or it["kind"] == CHECKBOX):
      continue
    if float(conf) < 40 and not re.search(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{2}", word):
      continue
    out.append((*b, word))
  return out


# ---------------------------------------------------------------- reading order -> text with markers

MARK = {FIELD: "____", CHECKBOX: "☐"}


def assemble(tokens: list[tuple], items: list[dict]) -> list[str]:
  """Group text tokens and item markers into lines (top-down, left-right)."""
  entries = [(t[0], t[1], t[3], t[4]) for t in tokens]
  for it in items:
    x0, top, x1, bottom = it["bbox"]
    if it["anchor"]:
      entries.append((it["anchor"][0], it["anchor"][1], it["anchor"][2], MARK[it["kind"]]))
    elif bottom - top > 25:
      entries.append((x0, top + 2, top + 10, MARK[it["kind"]]))   # tall box: a line of its own at its top
    else:
      entries.append((x0, top, bottom, MARK[it["kind"]]))
  entries.sort(key=lambda e: (e[1] + e[2]) / 2)
  lines: list[list] = []
  for e in entries:
    c = (e[1] + e[2]) / 2
    if lines:
      cur = lines[-1]
      cc = sum((x[1] + x[2]) / 2 for x in cur) / len(cur)
      hh = max(x[2] - x[1] for x in cur)
      if abs(c - cc) <= max(3, hh / 2):
        cur.append(e)
        continue
    lines.append([e])
  return [" ".join(e[3] for e in sorted(line, key=lambda e: e[0])) for line in lines]


# ---------------------------------------------------------------- high level

def pdf_text(path) -> tuple[str, list[dict]]:
  pages = pdf_vector(path)
  out, items = [], []
  for n, p in enumerate(pages, start=1):
    out.append(f"--- strona {n} ---")
    out += assemble(p["tokens"], p["items"])
    items += p["items"]
  return "\n".join(out), items


def image_text(data: bytes, lang="pol", ocr=True) -> tuple[str, list[dict], list[dict]]:
  """-> text with markers, items (pt, page-local), page geometry [{width_pt, height_pt}]."""
  img = Image.open(io.BytesIO(data)).convert("L")
  dpi = img.width / (210 / 25.4)
  out, items, geo = [], [], []
  for n, page in enumerate(split_pages(img), start=1):
    gray = np.array(page)
    its = image_raster(gray, n, dpi)
    items += its
    geo.append({"width": page.width * 72 / dpi, "height": page.height * 72 / dpi})
    out.append(f"--- strona {n} ---")
    if ocr:
      out += assemble(ocr_tokens(gray, n, dpi, its, lang), its)
  return "\n".join(out), items, geo


def overlay(pdf_path, items, out_dir, scale=1.4, prefix="f"):
  """Debug: draw items on rendered PDF pages (field = green, checkbox = red, label-cell anchor = blue)."""
  import pathlib

  import pypdfium2
  from PIL import ImageDraw
  doc = pypdfium2.PdfDocument(str(pdf_path))
  for i in range(len(doc)):
    im = doc[i].render(scale=scale).to_pil().convert("RGB")
    dr = ImageDraw.Draw(im)
    for it in items:
      if it["page"] != i + 1:
        continue
      x0, top, x1, bottom = (v * scale for v in it["bbox"])
      dr.rectangle((x0, top, x1, bottom), outline=(0, 170, 0) if it["kind"] == FIELD else (230, 0, 0), width=2)
      if it["anchor"]:
        ax, at = it["anchor"][0] * scale, it["anchor"][1] * scale
        dr.rectangle((ax, at, ax + 8, at + 8), fill=(0, 0, 255))
    im.save(pathlib.Path(out_dir) / f"{prefix}_p{i + 1}.png")


# ---------------------------------------------------------------- DOCX made of positioned shapes (PDF -> Word conversions)

_NS = {"wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
       "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
       "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
       "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
EMU = 12700
_BLANK_RUN = re.compile(r"(?:[.…_]\s?){4,}")


def _shape_color(sp, tag):
  el = sp.find(f"{tag}/a:solidFill/a:srgbClr", _NS) if tag else sp.find("a:solidFill/a:srgbClr", _NS)
  if el is None:
    return None
  v = el.get("val", "000000")
  r, g, b = (int(v[i:i + 2], 16) / 255 for i in (0, 2, 4))
  return 0.3 * r + 0.59 * g + 0.11 * b


def _custom_path(sp, x, y, w, h):
  """custGeom paths -> list of polygons in page points (curves reduced to their end points)."""
  polys = []
  for path in sp.iterfind("a:custGeom/a:pathLst/a:path", _NS):
    pw, ph = float(path.get("w") or 1) or 1, float(path.get("h") or 1) or 1
    cur = []
    for cmd in path:
      tag = cmd.tag.split("}")[1]
      if tag == "moveTo" and cur:
        polys.append(cur)
        cur = []
      pts = cmd.findall("a:pt", _NS)
      if pts:
        pt = pts[-1]
        cur.append((x + float(pt.get("x")) / pw * w, y + float(pt.get("y")) / ph * h))
    if cur:
      polys.append(cur)
  return polys


def docx_shapes(data: bytes, dpi: float = 200):
  """Absolutely positioned shapes of a DOCX drawn into page images (lines, boxes, shading, text as bars) plus
  text tokens from the text boxes. -> (text with markers, items). None when the document has few shapes."""
  import zipfile

  from lxml import etree
  archive = zipfile.ZipFile(io.BytesIO(data))
  root = etree.fromstring(archive.read("word/document.xml"))
  anchors = list(root.iter(f"{{{_NS['wp']}}}anchor"))
  if len(anchors) < 20:
    return None
  sect = root.find(".//w:body/w:sectPr", _NS)
  size, margin = sect.find("w:pgSz", _NS), sect.find("w:pgMar", _NS)
  page_w, page_h = int(size.get(f"{{{_NS['w']}}}w")) / 20, int(size.get(f"{{{_NS['w']}}}h")) / 20
  left, top_m = int(margin.get(f"{{{_NS['w']}}}left")) / 20, int(margin.get(f"{{{_NS['w']}}}top")) / 20
  shapes, tokens = [], []
  # a PDF->Word conversion anchors all shapes of one page in one paragraph: that paragraph is the page
  page_of, paragraphs = {}, [p for p in root.find("w:body", _NS) if p.find(".//wp:anchor", _NS) is not None]
  for index, paragraph in enumerate(paragraphs):
    for an in paragraph.iter(f"{{{_NS['wp']}}}anchor"):
      page_of[an] = index
  for an in anchors:
    off_h, off_v = an.find("wp:positionH/wp:posOffset", _NS), an.find("wp:positionV/wp:posOffset", _NS)
    ext = an.find("wp:extent", _NS)
    if off_h is None or off_v is None or ext is None:
      continue
    x = int(off_h.text) / EMU + (left if an.find("wp:positionH", _NS).get("relativeFrom") in ("column", "margin") else 0)
    y = int(off_v.text) / EMU + (top_m if an.find("wp:positionV", _NS).get("relativeFrom") in ("paragraph", "margin", "line") else 0)
    y += page_of.get(an, 0) * page_h
    w, h = int(ext.get("cx")) / EMU, int(ext.get("cy")) / EMU
    sp = an.find(".//wps:spPr", _NS)
    txbx = an.find(".//wps:txbx", _NS)
    text = ""
    if txbx is not None:
      text = " ".join("".join(t.text or "" for t in p.iter(f"{{{_NS['w']}}}t")) for p in txbx.iter(f"{{{_NS['w']}}}p")).strip()
      if text:
        sz = txbx.find(".//w:sz", _NS)
        size = int(sz.get(f"{{{_NS['w']}}}val")) / 2 if sz is not None else 10
        tokens.append((x, y, x + min(w, 0.5 * size * len(text)), y + h, text))   # box is wider than its text
    if sp is None:
      continue
    fill, line = _shape_color(sp, None), _shape_color(sp, "a:ln")
    shapes.append((x, y, w, h, fill, line, _custom_path(sp, x, y, w, h)))
  pages = max(1, len(paragraphs))
  k = dpi / 72
  canvas = np.full((round(pages * page_h * k), round(page_w * k)), 255, np.uint8)
  for x, y, w, h, fill, line, path in sorted(shapes, key=lambda s: -(s[2] * s[3])):   # big shading first
    p0, p1 = (round(x * k), round(y * k)), (round((x + w) * k), round((y + h) * k))
    if path and fill is not None and fill < 0.97:
      # a frame is one path with an outer and an inner outline (even-odd fill): draw the path, not its box
      polys = [np.array([(round(px * k), round(py * k)) for px, py in poly], np.int32) for poly in path if len(poly) >= 2]
      color = int(fill * 255) if fill >= 0.5 else 0
      mask = np.zeros_like(canvas)
      for poly in polys:
        layer = np.zeros_like(canvas)
        cv2.fillPoly(layer, [poly], 255)
        if (layer > 0).sum() == 0:
          cv2.polylines(layer, [poly], False, 255, 1)
        mask ^= layer
      canvas[mask > 0] = color
    elif fill is not None and fill < 0.97:
      cv2.rectangle(canvas, p0, (max(p1[0], p0[0] + 1), max(p1[1], p0[1] + 1)), int(fill * 255) if fill >= 0.5 else 0, -1)
    if line is not None and line < 0.5:
      cv2.rectangle(canvas, p0, p1, 0, max(1, round(0.5 * k)))
  for x0, y0, x1, y1, text in tokens:   # text as letter-sized blobs, so cells with text are not "empty"
    hh = y1 - y0
    for cx in np.arange(x0 + 0.5, x1 - 0.5, 4):    # 3 pt blobs with gaps: never mistaken for a ruled line
      cv2.rectangle(canvas, (round(cx * k), round((y0 + 0.25 * hh) * k)), (round((cx + 3) * k), round((y1 - 0.25 * hh) * k)), 0, -1)
  out, items = [], []
  for n in range(pages):
    gray = canvas[round(n * page_h * k):round((n + 1) * page_h * k)]
    its = image_raster(gray, n + 1, dpi)
    off = n * page_h
    toks = []
    for x0, y0, x1, y1, text in tokens:
      if off <= y0 < off + page_h:
        text = _BLANK_RUN.sub(" ____ ", text)
        for g in BOX_CHARS + "":
          text = text.replace(g, " ☐ ")
        toks.append((x0, y0 - off, x1, y1 - off, text))
    items += its
    out.append(f"--- strona {n + 1} ---")
    out += assemble(toks, [i for i in its if not (i["via"] == "dots")])   # dotted runs are already text
  return "\n".join(out), items, canvas



def pdf_raster(path, dpi: float = 200) -> tuple[str, list[dict]]:
  """PDF variant without vector parsing: text layer for words, dotted runs and glyph boxes; the rendered page
  through image_raster for everything drawn (cells, combs, underlines, label cells)."""
  import pypdfium2
  doc = pypdfium2.PdfDocument(str(path))
  out, items = [], []
  for n, page in enumerate(pdf_vector(path), start=1):
    gray = np.array(doc[n - 1].render(scale=dpi / 72).to_pil().convert("L"))
    text_items = [i for i in page["items"] if i["via"] in ("dots", "glyph")]
    drawn = [i for i in image_raster(gray, n, dpi) if i["via"] != "dots" and not (
      i["kind"] == CHECKBOX and any(abs(i["bbox"][0] - t["bbox"][0]) < 6 and abs(i["bbox"][1] - t["bbox"][1]) < 6 for t in text_items))]
    out.append(f"--- strona {n} ---")
    out += assemble(page["tokens"], text_items + drawn)
    items += text_items + drawn
  return "\n".join(out), items
