import pathlib

import pytest

from hacknation_2026.contracts import AppError, FileFormat
from hacknation_2026.extract.sheet import BOXED, FIELD, TEXT, Item, extract_ods, extract_xlsx, group_lines, line_text

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
# Skip OS/editor artifacts: .DS_Store (Finder) and ~$* lock files Excel creates while a file is open.
SAMPLES = sorted(p for p in BLANKIETY.rglob("*")
                 if p.suffix.lower() in (".xlsx", ".ods") and not p.name.startswith((".", "~$")))

# Form titles as printed on the paper forms (checked by hand).
TITLES = {
  "1": "numeru porządkowego", "2": "zwrot opłaty skarbowej", "3": "wydanie zaświadczenia",
  "4": "świetlicy", "5": "nadpłaty podatku", "6": "zajęcie pasa drogowego",
  "7": "ras uznawanych za agresywne", "8": "deklaracja o wysokości", "9": "stypendium",
}


def extract(path: pathlib.Path):
  return (extract_xlsx if path.suffix.lower() == ".xlsx" else extract_ods)(path.read_bytes())


def both(form: str) -> list[pathlib.Path]:
  return [p for p in SAMPLES if p.parent.name.startswith(form + ".")]


def test_samples_found():
  assert len(SAMPLES) == 16


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: f"{p.parent.name[:2]}{p.suffix}")
def test_title_present(path):
  assert TITLES[path.parent.name.split(".")[0]] in extract(path).as_text().lower()


@pytest.mark.parametrize("path", both("1"), ids=lambda p: p.suffix)
def test_fields_merged_across_rows(path):
  # the underline (merged N115:AJ118) starts one row above its label (A116) and must land on the same line
  text = extract(path).as_text()
  assert "w miejscowości ____ przy ulicy1) ____" in text
  assert "nr ewidencyjny działki ____ w obrębie ____" in text


@pytest.mark.parametrize("path", both("2"), ids=lambda p: p.suffix)
def test_bordered_cells_become_fields(path):
  text = extract(path).as_text()
  assert "Nazwa /Imię i nazwisko ____" in text
  assert "NIP ____" in text                           # ten one-digit boxes = one field
  assert "Kod pocztowy ____ - ____" in text


@pytest.mark.parametrize("path", both("9"), ids=lambda p: p.suffix)
def test_checkboxes_and_sheets_as_pages(path):
  doc = extract(path)
  assert "Prezydent Miasta Zgierza" in [b.text for b in doc.blocks if b.kind == "checkbox"]
  assert max(b.page for b in doc.blocks) == 4
  assert doc.format == (FileFormat.XLSX if path.suffix == ".xlsx" else FileFormat.ODS)


def test_xlsx_and_ods_agree():
  for form in ("1", "2", "9"):
    xlsx, ods = (extract(p).as_text() for p in sorted(both(form), key=lambda p: p.suffix != ".xlsx"))
    assert xlsx == ods


def test_line_text_rules():
  box, field = Item(0, 0, 0, BOXED), Item(0, 0, 1, FIELD)
  assert line_text([box, Item(0, 0, 2, TEXT, "Tak")]) == "☐ Tak"
  assert line_text([Item(0, 0, 0, TEXT, "NIP"), box, box]) == "NIP ____"       # run of digit boxes
  assert line_text([Item(0, 0, 0, TEXT, "Uwagi"), box]) == "Uwagi ____"         # box with no label after it
  assert line_text([field]) == "____"


def test_group_lines_by_vertical_overlap():
  label, underline, below = Item(5, 9, 0, TEXT, "a"), Item(4, 7, 3, FIELD), Item(10, 10, 0, TEXT, "b")
  assert group_lines([below, underline, label]) == [[label, underline], [below]]
  tall = Item(0, 50, 0, TEXT, "ramka")                       # tall merged cell must not swallow later rows
  assert len(group_lines([tall, Item(20, 20, 1, TEXT, "x")])) == 2


@pytest.mark.parametrize("call", [lambda: extract_xlsx(b"PK\x03\x04 zepsuty"), lambda: extract_ods(b"nie ods")])
def test_unreadable_file(call):
  with pytest.raises(AppError) as exc:
    call()
  assert exc.value.code == "UNREADABLE_FILE"
