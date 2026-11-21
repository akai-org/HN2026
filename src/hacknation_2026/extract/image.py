"""OCR of images and scanned pages (block B1)."""

import io
import math

import pytesseract
from PIL import Image, ImageOps

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import line_block

A4_RATIO = 297 / 210
MIN_WORD_CONFIDENCE = 40   # below this a word is OCR noise, usually misread fill-in dots


def extract_image(data: bytes, fmt: FileFormat, lang: str = "pol") -> ExtractedDocument:
  try:
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("L")
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać obrazu", 422) from exc
  blocks: list[Block] = []
  for number, page in enumerate(split_pages(image), start=1):
    blocks += ocr_blocks(page, number, lang)
  return ExtractedDocument(format=fmt, blocks=blocks)


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
  # shortcut: a few small labels are still missed; a vision LLM would read them better.
  data = pytesseract.image_to_data(image, lang=lang, config="--psm 11", output_type=pytesseract.Output.DICT)
  words = [(top, left, height, word, float(conf))
           for word, conf, top, left, height in zip(data["text"], data["conf"], data["top"], data["left"], data["height"])
           if word.strip()]
  blocks = []
  for line in _group_lines(words):
    if all(conf < MIN_WORD_CONFIDENCE for *_, conf in line):
      continue
    # low-confidence words are almost always misread fill-in dots, so they become a blank marker
    block = line_block(" ".join(word if conf >= MIN_WORD_CONFIDENCE else "...." for *_, word, conf in line), page)
    if block:
      blocks.append(block)
  return blocks


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
