import pathlib

import httpx
import pytest
from fastapi.testclient import TestClient

from hacknation_2026 import pipeline
from hacknation_2026.app import app
from hacknation_2026.config import Settings, get_settings
from hacknation_2026.contracts import AppError, FileFormat, FormSpec
from hacknation_2026.extract import extract_document

BLANKIETY = pathlib.Path(__file__).parents[2] / "dane_zadania" / "blankiety"
FORM5 = next(BLANKIETY.glob("5.*/*.PDF"))
SPEC = FormSpec(title="Wniosek o test", pages=[])


@pytest.fixture
def client(monkeypatch):
  settings = Settings(_env_file=None, llm_api_key="k", llm_model="m", llm_base_url="http://llm.test/v1", max_file_size_mb=1)
  app.dependency_overrides[get_settings] = lambda: settings
  calls = []

  def fake_analyze(document, _settings):
    calls.append(document)
    return SPEC

  monkeypatch.setattr(pipeline, "analyze", fake_analyze)
  yield TestClient(app), calls
  app.dependency_overrides.clear()


def upload(client, name: str, data: bytes):
  return client.post("/api/forms/convert", files={"file": (name, data)})


def test_convert_runs_validation_extraction_llm_and_builder(client):
  http, calls = client
  response = upload(http, FORM5.name, FORM5.read_bytes())
  assert response.status_code == 200
  form = response.json()["form"]
  assert form["title"] == "Wniosek o test"
  assert form["tabs"][-1]["type"] == "FINISH" and form["flow"]["links"]   # a built FormDefinition, not the FormSpec
  assert response.json()["warnings"] == []
  assert "nadpłaty podatku" in calls[0].as_text()          # the LLM got the extracted text


@pytest.mark.parametrize("name,data,status,code", [
  ("wniosek.txt", b"%PDF-1.4", 415, "UNSUPPORTED_FORMAT"),
  ("wniosek.png", b"%PDF-1.4", 415, "MIME_MISMATCH"),
  ("wnio$ek.pdf", b"%PDF-1.4", 422, "INVALID_FILENAME"),
  ("wniosek.pdf", b"%PDF-1.4" + b"x" * 1024 * 1024, 413, "FILE_TOO_LARGE"),
])
def test_convert_rejects_bad_files(client, name, data, status, code):
  http, calls = client
  response = upload(http, name, data)
  assert response.status_code == status
  assert response.json()["code"] == code
  assert response.json()["message"]                        # the frontend shows `message`
  assert not calls


def test_convert_reports_llm_errors(client, monkeypatch):
  http, _ = client

  def unavailable(*_):
    raise AppError("LLM_UNAVAILABLE", "Brak połączenia z modelem językowym", 503)

  monkeypatch.setattr(pipeline, "analyze", unavailable)
  response = upload(http, FORM5.name, FORM5.read_bytes())
  assert response.status_code == 503
  assert response.json() == {"code": "LLM_UNAVAILABLE", "message": "Brak połączenia z modelem językowym"}


@pytest.mark.parametrize("llm_reply,expected", [(httpx.Response(200, json={"data": []}), "ok"), (httpx.Response(401), "unavailable"), (None, "unavailable")])
def test_health_reports_llm(client, monkeypatch, llm_reply, expected):
  http, _ = client

  def fake_get(*_, **__):
    if llm_reply is None:
      raise httpx.ConnectError("brak")
    return llm_reply

  monkeypatch.setattr(httpx, "get", fake_get)
  assert http.get("/api/health").json() == {"status": "ok", "llm": expected}


@pytest.mark.parametrize("pattern,fmt", [
  ("5.*/*.PDF", FileFormat.PDF), ("5.*/*.PNG", FileFormat.PNG), ("1.*/*.doc", FileFormat.DOC),
  ("1.*/*.docx", FileFormat.DOCX), ("1.*/*.xlsx", FileFormat.XLSX), ("1.*/*.ods", FileFormat.ODS),
])
def test_dispatcher_covers_every_format(pattern, fmt):
  path = next(p for p in BLANKIETY.glob(pattern) if not p.name.startswith("~$"))
  document = extract_document(path.read_bytes(), fmt)
  assert document.format == fmt and document.blocks
