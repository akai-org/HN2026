"""Fill-in places found in the page image with OpenCV: blank lines (underlines, dotted lines), checkboxes
and rows of character boxes. OCR engines read text only, so these are detected separately and merged into
the text by position.

All sizes are in millimetres of an A4-wide page, so the detector does not depend on the scan resolution.
"""

from dataclasses import dataclass

import cv2
import numpy as np

FIELD, BOX = "field", "box"


@dataclass(frozen=True)
class Mark:
  kind: str          # FIELD (place to write) or BOX (checkbox)
  x0: int
  y0: int
  x1: int
  y1: int

  @property
  def cy(self) -> float:
    return (self.y0 + self.y1) / 2


def detect_marks(gray: np.ndarray, page_width_mm: float = 210) -> list[Mark]:
  """Marks on one page; `gray` is a uint8 grayscale image (0 = black)."""
  mm = gray.shape[1] / page_width_mm
  otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[0]
  # Otsu splits text from paper; light-grey box outlines sit above it, so move the cut towards the paper colour.
  cut = otsu + 0.4 * (float(np.median(gray)) - otsu)
  ink = np.where(gray < cut, 255, 0).astype(np.uint8)
  boxes, frames = _boxes(ink, mm)
  fields = [f for f in frames if f.kind == FIELD]
  boxes = [b for b in boxes if not any(_contains(f, b) for f in fields)]   # cells of a character-box field
  lines = _blank_lines(ink, mm, boxes + frames)
  return lines + boxes + fields


def _contains(outer: Mark, inner: Mark, tolerance: int = 3) -> bool:
  return (outer.x0 - tolerance <= inner.x0 and outer.y0 - tolerance <= inner.y0
          and inner.x1 <= outer.x1 + tolerance and inner.y1 <= outer.y1 + tolerance)


def _blank_lines(ink: np.ndarray, mm: float, shapes: list[Mark]) -> list[Mark]:
  # Dots of a dotted line are ~1-2 mm apart: closing joins them; letters join too, but into thick strokes.
  joined = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, round(2 * mm)), 1)))
  long_runs = cv2.morphologyEx(joined, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (round(12 * mm), 1)))
  count, _, stats, _ = cv2.connectedComponentsWithStats(long_runs)
  marks = []
  for x, y, w, h, _ in stats[1:count]:
    if h > 3 * mm:
      continue
    band_top = max(0, round(y - 2.5 * mm))   # letters reach well above the line; judge them on a taller band
    for sx, sw in _thin_segments(ink[band_top:y + h, x:x + w], mm):
      if any(_on_edge(x + sx, y, sw, h, s, mm) for s in shapes):
        continue                           # an edge of a checkbox, a character box or a frame
      # A blank line has free space above (not underlined text) and just below (not a stroke through a word).
      if _ink_above(ink, x + sx, y, sw, mm) < 0.12 and _ink_below(ink, x + sx, y + h, sw, mm) < 0.25:
        marks.append(Mark(FIELD, int(x + sx), int(y), int(x + sx + sw), int(y + h)))
  return marks


def _thin_segments(region: np.ndarray, mm: float) -> list[tuple[int, int]]:
  """Parts of a horizontal run made only of a rule or dots. Closing glues a dotted line to the words next to it
  ("w kwocie ......"), so columns where ink spans more than 1 mm vertically (letters) split the run; dots and
  rules are lower than that. `region` is the run plus a band above it. Pieces shorter than 8 mm are dropped."""
  inked = region > 0
  rows = np.arange(region.shape[0])[:, None]
  top = np.where(inked, rows, region.shape[0]).min(axis=0)
  bottom = np.where(inked, rows, -1).max(axis=0)
  letter = (bottom - top + 1) > 1.0 * mm
  counts = inked.sum(axis=0)
  segments, start = [], None
  for i, is_letter in enumerate(list(letter) + [True]):
    if not is_letter and start is None:
      start = i
    elif is_letter and start is not None:
      if i - start >= 8 * mm and (counts[start:i] > 0).mean() >= 0.2:
        segments.append((start, i - start))
      start = None
  return segments


def _on_edge(x: int, y: int, w: int, h: int, shape: Mark, mm: float) -> bool:
  overlap = min(x + w, shape.x1) - max(x, shape.x0)
  near_edge = abs(y - shape.y0) < 1.5 * mm or abs(y + h - shape.y1) < 1.5 * mm
  return overlap > 0.5 * min(w, shape.x1 - shape.x0) and near_edge


def _ink_above(ink: np.ndarray, x: int, y: int, w: int, mm: float) -> float:
  """Share of columns with ink just above the line: underlined text has plenty, a blank line has none.
  Only 2.5 mm are checked, so descenders of the previous text line (forms with tight spacing) do not count."""
  top, bottom = max(0, round(y - 2.5 * mm)), max(0, round(y - 0.6 * mm))
  left, right = round(x + mm), round(x + w - mm)
  if bottom <= top or right <= left:
    return 1.0
  return float((ink[top:bottom, left:right].max(axis=0) > 0).mean())


FRAME = "frame"   # rectangle with text inside: not a field, but its edges are not blank lines either


def _ink_below(ink: np.ndarray, x: int, y: int, w: int, mm: float) -> float:
  top, bottom = round(y + 0.3 * mm), round(y + 1.2 * mm)
  left, right = round(x + mm), round(x + w - mm)
  if bottom > ink.shape[0] or right <= left:
    return 0.0
  return float((ink[top:bottom, left:right].max(axis=0) > 0).mean())


def _boxes(ink: np.ndarray, mm: float) -> tuple[list[Mark], list[Mark]]:
  """(checkboxes and rows of character boxes, larger rectangles: empty ones are fields, others FRAME)."""
  contours, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
  small, frames = [], []
  for contour in contours:
    x, y, w, h = cv2.boundingRect(contour)
    is_box = 1.6 * mm <= w <= 8 * mm and 1.6 * mm <= h <= 8 * mm and 0.7 <= w / h <= 1.4   # font □ glyphs are ~2 x 2.7 mm
    is_frame = w >= 8 * mm and 3 * mm <= h <= 25 * mm
    if not (is_box or is_frame):
      continue
    approx = cv2.approxPolyDP(contour, 0.08 * cv2.arcLength(contour, True), True)
    if len(approx) != 4 or cv2.contourArea(contour) < 0.88 * w * h:
      continue                             # round letters (an ellipse fills ~79% of its box) or open shapes
    margin = round(mm) if is_frame else max(1, w // 5)
    inner = ink[y + margin:y + h - margin, x + margin:x + w - margin]
    if is_frame and inner.size:
      # thin vertical dividers of character boxes (postcode, NIP) do not make a frame "filled"
      dividers = cv2.morphologyEx(inner, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, round(0.7 * inner.shape[0])))))
      inner = cv2.subtract(inner, dividers)
    filled = inner.mean() / 255 if inner.size else 0.0
    if is_box:
      if filled <= 0.35:                   # a filled square is a bullet, not an empty box
        small.append(Mark(BOX, x, y, x + w, y + h))
    else:
      frames.append(Mark(FIELD if filled < 0.01 else FRAME, x, y, x + w, y + h))
  return _merge_rows(_dedupe(small), mm), _dedupe(frames)


def _dedupe(boxes: list[Mark]) -> list[Mark]:
  """A drawn box gives an outer and an inner contour; keep the outer one."""
  result: list[Mark] = []
  for box in sorted(boxes, key=lambda b: -(b.x1 - b.x0) * (b.y1 - b.y0)):
    if not any(o.x0 <= box.x0 + 2 and o.y0 <= box.y0 + 2 and box.x1 <= o.x1 + 2 and box.y1 <= o.y1 + 2 for o in result):
      result.append(box)
  return result


def _merge_rows(boxes: list[Mark], mm: float) -> list[Mark]:
  """Boxes touching side by side (e.g. one digit each for NIP or a postcode) form one field; a lone box is a checkbox."""
  rows: list[list[Mark]] = []
  for box in sorted(boxes, key=lambda b: (round(b.cy / (2 * mm)), b.x0)):
    last = rows[-1][-1] if rows else None
    if last and abs(box.cy - last.cy) < 1.5 * mm and -1.5 * mm <= box.x0 - last.x1 < 1.5 * mm:   # boxes may share an edge
      rows[-1].append(box)
    else:
      rows.append([box])
  marks = []
  for row in rows:
    if len(row) == 1:
      marks.append(row[0])
    else:
      marks.append(Mark(FIELD, row[0].x0, min(b.y0 for b in row), row[-1].x1, max(b.y1 for b in row)))
  return marks
