"""The contracts must be able to express the subject-matter pages of the reference outputs."""

import json
import pathlib
import re

import pytest

from hacknation_2026.contracts import Condition, FieldSpec, FormSpec, PageSpec, SectionSpec

REFERENCES = sorted((pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety").glob("*/konfiguracja_form_*.json"))
# '"Opcja" in tabs[...].questions[...].field.repeatingSectionGrid['pole' in field.techName].field.__userAnswer'
SINGLE_CONDITION = re.compile(r"""^\(?"(?P<equals>[^"]+)" in tabs\[.*\['(?P<field>[^']+)' in field\.techName\]\.field\.__userAnswer\)?$""")


def to_conditions(states: list[dict]) -> list[Condition]:
  conditions = []
  for state in states:
    assert state["type"] == "SHOW"
    match = SINGLE_CONDITION.match(state["query"].strip())
    assert match, f"query not expressible as a single Condition: {state['query']}"
    conditions.append(Condition(field=match["field"], equals=match["equals"]))
  return conditions


def subject_pages(form: dict) -> list[dict]:
  # Builder adds the first page ("Dane"), the contact/consent page and FINISH; the rest comes from FormSpec.
  return form["tabs"][1:-2]


@pytest.mark.parametrize("path", REFERENCES, ids=lambda p: p.parent.name[:2])
def test_subject_pages_fit_form_spec(path):
  form = json.loads(path.read_text())
  pages = [
    PageSpec(title=tab["title"], sections=[
      SectionSpec(
        key=section["field"]["techName"],
        title=section["field"]["title"],
        repeating=section["field"]["type"] == "REPEATING_SECTION",
        show_if=to_conditions(section["field"].get("states", [])),
        fields=[
          FieldSpec(
            key=q["field"]["techName"],
            label=q["field"]["title"],
            type=q["field"]["type"],
            required=False,  # reference outputs never fill `validation`
            description=re.sub(r"<[^>]+>", "", q["field"]["description"]),
            options=[o["name"] for o in q["field"]["options"]],
            show_if=to_conditions(q["field"].get("states", [])),
          )
          for q in section["field"]["repeatingSectionGrid"]
        ],
      )
      for section in tab["questions"]
    ])
    for tab in subject_pages(form)
  ]
  spec = FormSpec(title=form["title"], pages=pages)
  keys = {f.key for p in spec.pages for s in p.sections for f in s.fields}
  for field in (f for p in spec.pages for s in p.sections for f in s.fields):
    assert {c.field for c in field.show_if} <= keys, "condition must point at a field from FormSpec"
  assert FormSpec.model_validate_json(spec.model_dump_json()) == spec
