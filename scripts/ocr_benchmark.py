"""OCR quality on the sample forms: every form exists as a PDF with a text layer and as images,
so the PDF text is the ground truth for OCR of the image.

Usage: uv run python scripts/ocr_benchmark.py [engine] [form numbers, e.g. 1,5]
Engines are functions `image bytes -> text` registered in ENGINES below.
"""

import collections
import pathlib
import re
import sys
import time

from hacknation_2026.contracts import FileFormat
from hacknation_2026.extract.image import extract_image
from hacknation_2026.extract.pdf import extract_pdf

BLANKIETY = pathlib.Path(__file__).parents[1] / "dane_zadania" / "blankiety"
_WORD = re.compile(r"[0-9a-ząćęłńóśźż]{2,}")


def words(text: str) -> collections.Counter:
  return collections.Counter(_WORD.findall(text.lower()))


def score(truth: str, ocr: str) -> tuple[float, float, int, int]:
  """(word recall, word precision, blanks in truth, blanks in OCR) – words counted with multiplicity."""
  t, o = words(truth), words(ocr)
  hit = sum((t & o).values())
  return hit / max(1, sum(t.values())), hit / max(1, sum(o.values())), truth.count("____"), ocr.count("____")


def tesseract(data: bytes) -> str:
  return extract_image(data, FileFormat.PNG).as_text()


_paddle = None


def paddle_vl(data: bytes) -> str:
  """PaddleOCR-VL document parsing (Transformers engine, Apple GPU when available), page by page."""
  global _paddle
  import io

  import numpy as np
  import torch
  from paddleocr import PaddleOCRVL
  from PIL import Image

  from hacknation_2026.extract.image import split_pages

  if _paddle is None:
    _paddle = PaddleOCRVL(engine="transformers")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    inner = getattr(_paddle.paddlex_pipeline, "_pipeline", _paddle.paddlex_pipeline)
    for name in ("layout_det_model", "vl_rec_model"):   # engine_config does not reach the sub-models
      getattr(inner, name).infer.to(device)
  pages = split_pages(Image.open(io.BytesIO(data)).convert("RGB"))
  texts = []
  for page in pages:
    for result in _paddle.predict(np.array(page)):
      texts.append(result.markdown["markdown_texts"])
  return "\n".join(texts)


ENGINES = {"tesseract": tesseract, "paddle": paddle_vl}


def samples(forms: list[str] | None):
  for folder in sorted(BLANKIETY.iterdir()):
    number = folder.name.split(".")[0]
    if not folder.is_dir() or (forms and number not in forms):
      continue
    files = [p for p in folder.iterdir() if not p.name.startswith((".", "~$"))]
    pdf = next((p for p in files if p.suffix.lower() == ".pdf"), None)
    image = next((p for p in files if p.suffix.lower() == ".png"), None)
    if pdf and image:
      yield number, pdf, image


def main():
  engine_name = sys.argv[1] if len(sys.argv) > 1 else "tesseract"
  forms = sys.argv[2].split(",") if len(sys.argv) > 2 else None
  engine = ENGINES[engine_name]
  totals = []
  print(f"silnik: {engine_name}\nform | recall | precyzja | pola ____ (wzorzec/OCR) | czas")
  for number, pdf, image in samples(forms):
    truth = extract_pdf(pdf.read_bytes()).as_text()
    start = time.time()
    ocr = engine(image.read_bytes())
    elapsed = time.time() - start
    recall, precision, blanks_truth, blanks_ocr = score(truth, ocr)
    totals.append((recall, precision))
    print(f"  {number}  | {recall:.3f}  | {precision:.3f}    | {blanks_truth:3d}/{blanks_ocr:3d}                 | {elapsed:5.1f}s")
  print(f"ŚREDNIO | {sum(r for r, _ in totals) / len(totals):.3f} | {sum(p for _, p in totals) / len(totals):.3f}")


if __name__ == "__main__":
  main()
