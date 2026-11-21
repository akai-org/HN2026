import io
import pathlib
import zipfile

import pytest

from hacknation_2026.contracts import AppError, FileFormat
from hacknation_2026.extract.word import _doc_blocks, _strip_fields, extract_doc, extract_docx

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
# Skip OS/editor artifacts: .DS_Store (Finder) and ~$* lock files Word creates while a document is open.
SAMPLES = sorted(p for p in BLANKIETY.rglob("*") if p.suffix.lower() in (".doc", ".docx")
                 and "wizualizacja" not in p.name and not p.name.startswith((".", "~$")))

# Form titles as printed on the paper forms (checked by hand).
TITLES = {
  "1": "numeru porządkowego", "2": "zwrot opłaty skarbowej", "3": "wydanie zaświadczenia",
  "4": "świetlicy", "5": "nadpłaty podatku", "6": "zajęcie pasa drogowego",
  "7": "ras uznawanych za agresywne", "8": "deklaracja o wysokości", "9": "stypendium",
}


def extract(path: pathlib.Path):
  return (extract_doc if path.suffix.lower() == ".doc" else extract_docx)(path.read_bytes())


def sample(form: str, suffix: str) -> pathlib.Path:
  return next(p for p in SAMPLES if p.parent.name.startswith(form + ".") and p.suffix == suffix)


def test_samples_found():
  assert len(SAMPLES) == 17


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: f"{p.parent.name[:2]}{p.suffix}")
def test_title_present(path):
  text = extract(path).as_text().lower()
  assert TITLES[path.parent.name.split(".")[0]] in text


def test_doc_with_docx_content_is_read_as_docx():
  assert extract_doc(sample("5", ".DOC").read_bytes()).format == FileFormat.DOCX
  assert extract_doc(sample("1", ".doc").read_bytes()).format == FileFormat.DOC


def test_docx_text_boxes_are_not_duplicated():
  # form 2 keeps every line in a text box stored twice (mc:Choice + mc:Fallback)
  text = extract_docx(sample("2", ".docx").read_bytes()).as_text()
  assert text.count("Wniosek o zwrot opłaty skarbowej") == 1


def test_docx_list_bullets():
  # form 3: arrow bullets from list numbering -> "- "; form 9: box bullets -> checkbox blocks
  assert "- okresie posiadania gospodarstwa rolnego" in extract_docx(sample("3", ".docx").read_bytes()).as_text()
  doc9 = extract_docx(sample("9", ".docx").read_bytes())
  assert "Prezydent Miasta Zgierza" in [b.text for b in doc9.blocks if b.kind == "checkbox"]
  assert max(b.page for b in doc9.blocks) == 16


def test_docx_tables_and_inline_boxes():
  doc7 = extract_doc(sample("7", ".DOC").read_bytes())
  assert any(b.kind == "table" for b in doc7.blocks)
  assert "[ ] pies" in doc7.as_text()


def test_doc_tab_becomes_space():
  assert "Wnioskodawca: Adresat:" in extract_doc(sample("1", ".doc").read_bytes()).as_text()


def test_doc_fields_and_tables():
  assert _strip_fields("a\x13 FORMCHECKBOX \x14\x01\x15 tak\x13 PAGE \x141\x15") == "a☐\x01 tak1"
  blocks = _doc_blocks("Tytuł\rImię\x07Jan\x07\x07Nazwisko\x07Kowalski\x07\x07Po tabeli\r\x0cStrona 2\r")
  assert [b.kind for b in blocks] == ["text", "table", "text", "text"]
  assert blocks[1].rows == [["Imię", "Jan"], ["Nazwisko", "Kowalski"]]
  assert blocks[-1].page == 2


def test_docx_checkbox_content_control():
  xml = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
         '<w:p><w:r><w:t>☒ zgoda</w:t></w:r></w:p><w:p><w:r><w:t>☐ brak zgody</w:t></w:r></w:p></w:body></w:document>')
  rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
  buf = io.BytesIO()
  with zipfile.ZipFile(buf, "w") as z:
    z.writestr("word/document.xml", xml)
    z.writestr("word/_rels/document.xml.rels", rels)
  blocks = extract_docx(buf.getvalue()).blocks
  assert [(b.kind, b.text, b.checked) for b in blocks] == [("checkbox", "zgoda", True), ("checkbox", "brak zgody", False)]


@pytest.mark.parametrize("call", [lambda: extract_docx(b"PK\x03\x04 zepsuty"), lambda: extract_doc(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1zepsuty")])
def test_unreadable_file(call):
  with pytest.raises(AppError) as exc:
    call()
  assert exc.value.code == "UNREADABLE_FILE"
