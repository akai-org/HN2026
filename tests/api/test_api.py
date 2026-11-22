import pathlib

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hacknation_2026 import pipeline
from hacknation_2026.app import SpaStaticFiles, app
from hacknation_2026.config import Settings, get_settings
from hacknation_2026.contracts import (
  AppError, ExtractedDocument, FieldSpec, FileFormat, FormSpec, PageSpec, RuleViolation, SectionSpec,
)
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


def form_fields(form: dict):
  for tab in form["tabs"]:
    for question in tab["questions"]:
      yield question["field"]
      for child in question["field"].get("repeatingSectionGrid") or []:
        yield child["field"]


def test_convert_runs_validation_extraction_llm_and_builder(client):
  http, calls = client
  response = upload(http, FORM5.name, FORM5.read_bytes())
  assert response.status_code == 200
  body = response.json()
  assert body["form"]["title"] == "Wniosek o test"
  assert body["form"]["tabs"] and body["form"]["flow"]     # a FormDefinition from the builder, not the FormSpec
  assert body["warnings"] == [] and body["proposed_dictionaries"] == []
  assert "nadpłaty podatku" in calls[0].as_text()          # the LLM got the extracted text


def test_convert_enriches_fields_and_proposes_dictionaries(client, monkeypatch):
  http, _ = client
  vehicles = ["Samochód osobowy", "Samochód ciężarowy", "Motocykl", "Ciągnik rolniczy", "Przyczepa", "Autobus"]
  spec = FormSpec(title="Wniosek o test", pages=[PageSpec(title="Sprawa", sections=[SectionSpec(key="s", title="S", fields=[
    FieldSpec(key="kraj_urodzenia", label="Kraj urodzenia", type="TEXT_FIELD", required=True),
    FieldSpec(key="rodzaj_pojazdu", label="Rodzaj pojazdu", type="SELECT", required=True, options=vehicles),
  ])])])
  monkeypatch.setattr(pipeline, "analyze", lambda *_: spec)
  body = upload(http, FORM5.name, FORM5.read_bytes()).json()
  kraj = next(f for f in form_fields(body["form"]) if f["title"] == "Kraj urodzenia")
  assert kraj["type"] == "SELECT" and kraj["dictionaryName"] == "Kraje"
  assert body["proposed_dictionaries"] == [
    {"name": "RODZAJ_POJAZDU", "values_example": vehicles, "used_by": ["Rodzaj pojazdu"]},
  ]


BAD_FILES = [
  ("wniosek.txt", b"%PDF-1.4", 415, "UNSUPPORTED_FORMAT"),
  ("wniosek.png", b"%PDF-1.4", 415, "MIME_MISMATCH"),
  ("wnio$ek.pdf", b"%PDF-1.4", 422, "INVALID_FILENAME"),
  ("wniosek.pdf", b"%PDF-1.4" + b"x" * 1024 * 1024, 413, "FILE_TOO_LARGE"),
]


@pytest.mark.parametrize("name,data,status,code", BAD_FILES)
def test_convert_rejects_bad_files(client, name, data, status, code):
  http, calls = client
  response = upload(http, name, data)
  assert response.status_code == status
  assert response.json()["code"] == code
  assert response.json()["message"]                        # the frontend shows `message`
  assert not calls


@pytest.mark.parametrize("pattern,fmt", [("5.*/*.docx", "docx"), ("1.*/*.xlsx", "xlsx"), ("1.*/*.ods", "ods")])
def test_extract_returns_text_read_from_file_without_llm(client, pattern, fmt):
  """The frontend shows this text next to the digital form: browsers cannot display Word files and sheets."""
  http, calls = client
  path = next(p for p in BLANKIETY.glob(pattern) if "wizualizacja" not in p.name)
  response = http.post("/api/forms/extract", files={"file": (path.name, path.read_bytes())})
  assert response.status_code == 200
  document = ExtractedDocument.model_validate(response.json())
  assert document.format == fmt and document.as_text().strip()
  assert not calls                                         # no LLM call


@pytest.mark.parametrize("name,data,status,code", BAD_FILES)
def test_extract_rejects_bad_files(client, name, data, status, code):
  http, _ = client
  response = http.post("/api/forms/extract", files={"file": (name, data)})
  assert response.status_code == status
  assert response.json()["code"] == code


def test_frontend_routes_survive_reload(tmp_path):
  """/verify is a client-side route: the server returns index.html; missing assets and /api paths stay 404."""
  (tmp_path / "index.html").write_text("<div id=root></div>")
  (tmp_path / "assets").mkdir()
  (tmp_path / "assets" / "app.js").write_text("console.log(1)")
  site = FastAPI()
  site.mount("/", SpaStaticFiles(directory=tmp_path, html=True))
  http = TestClient(site)
  assert http.get("/").text == http.get("/verify").text == "<div id=root></div>"
  assert http.get("/assets/app.js").text == "console.log(1)"
  assert http.get("/assets/missing.js").status_code == 404
  assert http.get("/api/unknown").status_code == 404


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


def test_health_with_full_endpoint_url(client, monkeypatch):
  http, _ = client
  app.dependency_overrides[get_settings] = lambda: Settings(
    _env_file=None, llm_api_key="k", llm_model="m", llm_base_url="https://llm.test/v3/chat/completions")
  seen = []
  monkeypatch.setattr(httpx, "get", lambda url, **_: seen.append(url) or httpx.Response(200, json={"data": []}))
  assert http.get("/api/health").json()["llm"] == "ok"
  assert seen == ["https://llm.test/v3/models"]


def test_convert_reports_rule_violations_as_warnings(client, monkeypatch):
  http, _ = client
  checked = []

  def fake_check(form):
    checked.append(form)
    return [RuleViolation(code="TITLE_TOO_LONG", message="Tytuł ma ponad 255 znaków", path="title"),
            RuleViolation(code="NO_FINISH", message="Brak strony końcowej")]

  monkeypatch.setattr(pipeline, "check_form", fake_check)
  body = upload(http, FORM5.name, FORM5.read_bytes()).json()
  assert checked and checked[0]["title"] == "Wniosek o test"   # check_form checks the built form
  assert body["warnings"] == ["Tytuł ma ponad 255 znaków (title)", "Brak strony końcowej"]
