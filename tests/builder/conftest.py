import json
import pathlib
import pytest

from hacknation_2026.builder import build
from hacknation_2026.config import Settings
from hacknation_2026.contracts import FormSpec
from hacknation_2026.enrich import Enrichment

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def stub_enrichment(monkeypatch):
  """Enrichment stub: no dictionaries, no initial data, no validators."""
  calls = []

  def enrich_field(label, field_type, required, applicant_data):
    calls.append((label, field_type, required, applicant_data))
    return Enrichment()

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
