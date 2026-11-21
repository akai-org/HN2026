import pytest
from pydantic import ValidationError

from hacknation_2026.config import Settings
from hacknation_2026.contracts import Block, ExtractedDocument, FileFormat, FormSpec


def test_as_text_flattens_blocks_with_page_markers():
  doc = ExtractedDocument(format=FileFormat.PDF, blocks=[
    Block(kind="text", text="Wniosek o coś"),
    Block(kind="table", rows=[["Imię", " "], ["Nazwisko", "x"]]),
    Block(kind="checkbox", text="Tak", checked=True),
    Block(kind="checkbox", text="Nie", page=2),
  ])
  assert doc.as_text() == (
    "--- strona 1 ---\nWniosek o coś\nImię | \nNazwisko | x\n[x] Tak\n"
    "--- strona 2 ---\n[ ] Nie"
  )


def test_form_spec_schema_and_roundtrip():
  # Block C sends this schema to Ollama as `format`, so it must be generatable.
  assert "pages" in FormSpec.model_json_schema()["properties"]
  raw = ('{"title": "Wniosek o test", "pages": [{"title": "Sprawa", "sections": [{"key": "s", "title": "S", '
         '"fields": [{"key": "f", "label": "F", "type": "RADIO", "required": true, "options": ["A"], '
         '"show_if": [{"field": "g", "equals": "A"}]}]}]}]}')
  spec = FormSpec.model_validate_json(raw)
  assert spec.pages[0].sections[0].fields[0].show_if[0].equals == "A"
  with pytest.raises(ValidationError):
    FormSpec.model_validate_json(raw.replace('"RADIO"', '"WRONG"'))


def test_settings_from_env(monkeypatch):
  monkeypatch.setenv("JWT_SECRET", "s3cret")
  monkeypatch.setenv("AUTH_USERNAME", "anetka")
  monkeypatch.setenv("AUTH_PASSWORD", "haslo")
  monkeypatch.setenv("LLM_API_KEY", "klucz")
  monkeypatch.setenv("LLM_MODEL", "model")
  monkeypatch.setenv("MAX_FILE_SIZE_MB", "2")
  settings = Settings(_env_file=None)
  assert settings.max_file_size_bytes == 2 * 1024 * 1024
  assert settings.jwt_algorithm == "HS256"


def test_settings_require_secrets(monkeypatch):
  for name in ("JWT_SECRET", "AUTH_USERNAME", "AUTH_PASSWORD", "LLM_API_KEY", "LLM_MODEL"):
    monkeypatch.delenv(name, raising=False)
  with pytest.raises(ValidationError):
    Settings(_env_file=None)
