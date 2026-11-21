import pathlib
import shutil

import cv2
import numpy as np
import pytest

from hacknation_2026.contracts import FileFormat
from hacknation_2026.extract.fields import BOX, FIELD, detect_marks
from hacknation_2026.extract.image import extract_image
from hacknation_2026.extract.pdf import extract_pdf
from hacknation_2026.extract.word import extract_docx

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
needs_ocr = pytest.mark.skipif(shutil.which("tesseract") is None, reason="brak tesseract w systemie")
MM = 8   # synthetic page: 8 px per mm, 210 mm wide


def sample(form: str, ext: str) -> pathlib.Path:
  return next(p for p in BLANKIETY.rglob("*") if p.parent.name.startswith(form + ".") and p.suffix.lower() == ext
              and not p.name.startswith((".", "~$")))


def page() -> np.ndarray:
  return np.full((60 * MM, 210 * MM), 255, np.uint8)


def kinds(image: np.ndarray) -> list[str]:
  return sorted(m.kind for m in detect_marks(image))


def test_dotted_line_is_a_field():
  image = page()
  for x in range(20 * MM, 120 * MM, 9):                     # dots ~1.1 mm apart
    cv2.circle(image, (x, 30 * MM), 2, 0, -1)
  assert kinds(image) == [FIELD]


def test_underlined_text_is_not_a_field():
  image = page()
  text = "Podkreslony naglowek"
  (width, _), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 1.6, 3)
  cv2.putText(image, text, (20 * MM, 28 * MM), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 0, 3)
  cv2.line(image, (20 * MM, 29 * MM), (20 * MM + width, 29 * MM), 0, 2)   # underline exactly under the text
  assert FIELD not in kinds(image)


def test_checkbox_and_character_boxes():
  image = page()
  cv2.rectangle(image, (20 * MM, 10 * MM), (24 * MM, 14 * MM), 0, 2)          # lone box: checkbox
  for i in range(10):                                                           # NIP: ten touching boxes = one field
    cv2.rectangle(image, ((20 + 5 * i) * MM, 30 * MM), ((25 + 5 * i) * MM, 35 * MM), 0, 2)
  assert kinds(image) == [BOX, FIELD]


def test_letter_o_is_not_a_checkbox():
  image = page()
  cv2.ellipse(image, (40 * MM, 30 * MM), (2 * MM, 2 * MM), 0, 0, 360, 0, 3)
  assert BOX not in kinds(image)


@needs_ocr
@pytest.mark.parametrize("form", ["1", "3", "4", "5", "6"])
def test_image_fields_match_pdf(form):
  # the PDF of the same form is the reference for the number of places to write
  reference = extract_pdf(sample(form, ".pdf").read_bytes()).as_text().count("____")
  found = extract_image(sample(form, ".png").read_bytes(), FileFormat.PNG).as_text().count("____")
  assert abs(found - reference) <= max(2, reference // 10)


@needs_ocr
def test_checkboxes_from_image_and_pdf():
  # form 9 has 50 checkboxes (counted in its DOCX); light-grey glyph boxes must be found in the scan too
  assert extract_pdf(sample("9", ".pdf").read_bytes()).as_text().count("[ ]") == 50
  assert extract_image(sample("9", ".png").read_bytes(), FileFormat.PNG).as_text().count("[ ]") >= 40


def test_pdf_checkboxes_drawn_inside_tables():
  text = extract_pdf(sample("8", ".pdf").read_bytes()).as_text()
  assert "[ ] 1. właściciel/współwłaściciel" in text


def test_docx_dotted_tab_leaders_are_fields():
  # form 6 draws its fill-in lines as tabs with a dotted leader (45 lines in its PDF)
  assert extract_docx(sample("6", ".docx").read_bytes()).as_text().count("____") >= 43
