import io
import pathlib
import shutil

import pytest
from PIL import Image

from hacknation_2026.contracts import AppError, FileFormat
from hacknation_2026.extract._text import line_block, normalize
from hacknation_2026.extract.image import extract_image, split_pages
from hacknation_2026.extract.pdf import extract_pdf

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
needs_ocr = pytest.mark.skipif(shutil.which("tesseract") is None, reason="brak tesseract w systemie")

# Labels checked by hand on the paper forms; OCR misses some small print, so only robust ones are listed.
KEYS = {
  "1.": ["Wnioskodawca", "NUMERU PORZĄDKOWEGO", "miejscowości", "ewidencyjny"],
  "5.": ["PESEL", "NIP", "nadpłaty podatku", "rodzaj podatku", "korekta deklaracji"],
}


def sample(form: str, ext: str) -> pathlib.Path:
  return next(p for p in BLANKIETY.rglob("*") if p.parent.name.startswith(form) and p.suffix.lower() == ext)


def assert_keys(text: str, form: str):
  missing = [k for k in KEYS[form] if k.lower() not in text.lower()]
  assert not missing, f"brak etykiet: {missing}"


@pytest.mark.parametrize("form", KEYS)
def test_pdf_text_layer(form):
  doc = extract_pdf(sample(form, ".pdf").read_bytes())
  assert doc.format == FileFormat.PDF
  assert_keys(doc.as_text(), form)


@needs_ocr
@pytest.mark.parametrize("form", KEYS)
@pytest.mark.parametrize("ext,fmt", [(".jpg", FileFormat.JPEG), (".jpeg", FileFormat.JPEG), (".png", FileFormat.PNG)])
def test_image_ocr(form, ext, fmt):
  doc = extract_image(sample(form, ext).read_bytes(), fmt)
  assert doc.format == fmt
  assert_keys(doc.as_text(), form)


@needs_ocr
def test_scanned_pdf_falls_back_to_ocr():
  buf = io.BytesIO()
  Image.open(sample("5.", ".png")).convert("RGB").save(buf, format="PDF", resolution=130)  # PDF without a text layer
  doc = extract_pdf(buf.getvalue())
  assert_keys(doc.as_text(), "5.")


def test_tall_image_is_split_into_a4_pages():
  pages = split_pages(Image.new("L", (100, 425)))  # 3 x A4 height (141) + rounding
  assert [p.size for p in pages] == [(100, 141), (100, 141), (100, 141)]
  assert len(split_pages(Image.new("L", (100, 145)))) == 1


@needs_ocr
def test_multipage_image_keeps_page_numbers():
  doc = extract_image(sample("9.", ".png").read_bytes(), FileFormat.PNG)
  assert max(b.page for b in doc.blocks) == 16


def test_pdf_checkboxes():
  # form 9: SymbolMT box glyph () at line start -> checkbox blocks
  doc = extract_pdf(sample("9.", ".pdf").read_bytes())
  assert "Prezydent Miasta Zgierza" in [b.text for b in doc.blocks if b.kind == "checkbox"]
  # form 7: several boxes in one table row -> inline [ ]
  assert "[ ] pies" in extract_pdf(sample("7.", ".pdf").read_bytes()).as_text()


def test_pdf_arrow_bullets_are_not_checkboxes():
  # form 3: Wingdings arrow ⇨ () is a list bullet
  doc = extract_pdf(sample("3.", ".pdf").read_bytes())
  assert not [b for b in doc.blocks if b.kind == "checkbox"]
  assert "- okresie posiadania gospodarstwa rolnego" in doc.as_text()


def test_normalize_and_line_block():
  assert normalize("PESEL *........  NIP …………") == "PESEL * ____ NIP ____"
  assert line_block("❑ tak", 1).kind == "checkbox"
  assert line_block(" tak", 1).kind == "checkbox"
  assert line_block(" punkt", 1).text == "- punkt"
  assert normalize(" znak") == "• znak"
  assert line_block("Płeć: ❑ pies ❑ suka", 1).text == "Płeć: [ ] pies [ ] suka"
  assert line_block("   ", 1) is None


@pytest.mark.parametrize("call", [lambda: extract_pdf(b"%PDF-1.4 zepsuty"), lambda: extract_image(b"nie obraz", FileFormat.PNG)])
def test_unreadable_file(call):
  with pytest.raises(AppError) as exc:
    call()
  assert exc.value.code == "UNREADABLE_FILE"
