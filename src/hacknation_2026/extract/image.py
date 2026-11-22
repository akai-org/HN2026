"""OCR of images and scanned pages."""

import io
import math
import re

import numpy as np
import pytesseract
from PIL import Image, ImageOps

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import BOX, line_block
from hacknation_2026.extract.fields import BOX as BOX_MARK, FIELD, Mark, detect_marks

A4_RATIO = 297 / 210
MIN_WORD_CONFIDENCE = 40   # below this a word without letters is OCR noise, usually misread fill-in dots
_FOOTNOTE = re.compile(r"^(\d)\s?\)\s")                  # "1) Dane nieobowiązkowe."
_STRAY_QUOTE = re.compile(r"(?<=[\w)])[”\"](?=\s|$)")    # "ulicy”": Tesseract reads a superscript "1)" as a quote


def extract_image(data: bytes, fmt: FileFormat, lang: str = "pol") -> ExtractedDocument:
  try:
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("L")
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać obrazu", 422) from exc
  blocks: list[Block] = []
  for number, page in enumerate(split_pages(image), start=1):
    blocks += ocr_blocks(page, number, lang)
  return ExtractedDocument(format=fmt, blocks=restore_footnote_marks(blocks))


def restore_footnote_marks(blocks: list[Block]) -> list[Block]:
  """Puts back footnote marks that OCR turned into a closing quote, so the LLM can link a label to its footnote."""
  numbers = {m.group(1) for b in blocks if (m := _FOOTNOTE.match(b.text))}
  # shortcut: only a form with a single footnote number is fixed; with several we cannot tell which mark is which.
  # If OCR also lost the number of another footnote (form 1 loses "2)" of the signature), that mark becomes "1)" too;
  # re-OCR of the superscript crop would fix it, but was unreliable in tests.
  if len(numbers) != 1:
    return blocks
  mark = numbers.pop() + ")"
  for block in blocks:
    quotes = sum(block.text.count(q) for q in '"”“„')
    if quotes == 1 and not _FOOTNOTE.match(block.text):
      block.text = _STRAY_QUOTE.sub(mark, block.text)
  return blocks


def split_pages(image: Image.Image) -> list[Image.Image]:
  """Sample scans stack several A4 pages in one tall image; Tesseract rejects images over 32767 px."""
  page_height = round(image.width * A4_RATIO)
  count = max(1, math.ceil(image.height / page_height - 0.1))
  if count == 1:
    return [image]
  return [image.crop((0, i * page_height, image.width, min(image.height, (i + 1) * page_height))) for i in range(count)]


def ocr_blocks(image: Image.Image, page: int, lang: str) -> list[Block]:
  # Sparse mode (psm 11) finds the most labels on forms full of dotted fill-in lines,
  # but loses line structure, so words are regrouped into lines by their position.
  data = pytesseract.image_to_data(image, lang=lang, config="--psm 11", output_type=pytesseract.Output.DICT)
  words = [(top, left, height, word, float(conf), left + width)
           for word, conf, top, left, height, width
           in zip(data["text"], data["conf"], data["top"], data["left"], data["height"], data["width"])
           if word.strip()]
  marks = detect_marks(np.array(image))
  words = [w for w in words if not _is_noise(w, marks)]
  # Fill-in lines and checkboxes come from the image itself (OCR reads text only) and join the words by position.
  word_height = sorted(w[2] for w in words)[len(words) // 2] if words else 20
  for mark in marks:
    token = BOX if mark.kind == BOX_MARK else "____"
    center = mark.cy - (0.35 * word_height if mark.kind == FIELD else 0)   # a blank line sits on the text baseline
    words.append((round(center - word_height / 2), mark.x0, word_height, token, 100.0, mark.x1))
  blocks = []
  for line in _group_lines(words):
    block = line_block(" ".join(w[3] for w in line), page)
    if block:
      blocks.append(block)
  return blocks


def _is_noise(word: tuple, marks: list[Mark]) -> bool:
  """Misread fill-in dots: a low-confidence word without letters, or any word lying on a detected blank line."""
  top, left, height, text, conf, right = word
  if conf < MIN_WORD_CONFIDENCE and sum(ch.isalnum() for ch in text) < len(text) / 2:
    return True
  center_x, bottom = (left + right) / 2, top + height
  return any(m.kind == FIELD and m.x0 <= center_x <= m.x1 and m.y0 - height <= bottom <= m.y1 + height / 2
             and sum(ch.isalpha() for ch in text) < 2 for m in marks)


def _group_lines(words: list[tuple[int, int, int, str, float]]) -> list[list[tuple]]:
  """Words whose vertical centers are within half a word height belong to one line; lines sorted top-down."""
  lines: list[list[tuple]] = []
  for word in sorted(words, key=lambda w: w[0] + w[2] / 2):
    center = word[0] + word[2] / 2
    if lines:
      last = lines[-1]
      last_center = sum(w[0] + w[2] / 2 for w in last) / len(last)
      if abs(center - last_center) <= max(w[2] for w in last) / 2:
        last.append(word)
        continue
    lines.append([word])
  return [sorted(line, key=lambda w: w[1]) for line in lines]
