import json
import pathlib
from dataclasses import dataclass, field

import pytest

from hacknation_2026.builder import build
from hacknation_2026.config import Settings
from hacknation_2026.contracts import FormSpec

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


@dataclass
class StubEnrichment:
  """Same shape as block E's `Enrichment`; empty until block E lands."""
  dictionary_name: str | None = None
  multi_level_tree: bool = False
  search_enabled: bool = False
  default_value: str | None = None
  external: bool = False
  read_only: bool = False
  validators: list[str] = field(default_factory=list)


@pytest.fixture(autouse=True)
def stub_enrichment(monkeypatch):
  """Block E stub: no dictionaries, no initial data, no validators."""
  calls = []

  def enrich_field(label, field_type, required, applicant_data):
    calls.append((label, field_type, required, applicant_data))
    return StubEnrichment()

  monkeypatch.setattr(build, "enrich_field", enrich_field)
  return calls


@pytest.fixture
def settings():
  return Settings(_env_file=None, llm_api_key="k", llm_model="m")


def load_spec(name: str) -> FormSpec:
  return FormSpec.model_validate_json((FIXTURES / name).read_text(encoding="utf-8"))


def load_reference(number: int) -> dict:
  root = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
  path = next(root.glob(f"{number}.*/konfiguracja_form_*.json"))
  return json.loads(path.read_text(encoding="utf-8"))
