import json

import httpx
import pytest

from hacknation_2026.ai import analyze, client
from hacknation_2026.config import Settings
from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat, FormSpec

VALID_SPEC = {
  "title": "Wniosek o testowe zezwolenie",
  "authority_kind": "URZAD",
  "pages": [{
    "title": "Informacje o sprawie",
    "sections": [{
      "key": "sprawa",
      "title": "Sprawa",
      "fields": [
        {"key": "czy_dotyczy", "label": "Czy dotyczy", "type": "RADIO", "required": True, "options": ["Tak", "Nie"]},
        {"key": "opis", "label": "Opis", "type": "TEXTAREA", "required": True,
         "show_if": [{"field": "czy_dotyczy", "equals": "Tak"}]},
      ],
    }],
  }],
  "consents": ["Oświadczam, że dane są prawdziwe."],
}


@pytest.fixture
def settings():
  return Settings(
    _env_file=None, llm_api_key="test-key", llm_model="test-model", llm_base_url="https://llm.test/v1", llm_timeout_s=5,
  )


@pytest.fixture
def doc():
  return ExtractedDocument(format=FileFormat.DOCX, blocks=[
    Block(kind="text", text="WNIOSEK O TESTOWE ZEZWOLENIE"),
    Block(kind="checkbox", text="tak", checked=False),
  ])


def completion(content: str) -> dict:
  return {"choices": [{"message": {"role": "assistant", "content": content}}]}


def mock_llm(monkeypatch, handler):
  """Routes all LLM traffic to `handler`; returns the list of captured request bodies."""
  requests: list[dict] = []

  def wrapped(request: httpx.Request) -> httpx.Response:
    requests.append({"url": str(request.url), "headers": dict(request.headers), "body": json.loads(request.content)})
    return handler(request, len(requests))

  monkeypatch.setattr(client, "_make_client", lambda s: httpx.Client(transport=httpx.MockTransport(wrapped)))
  return requests


def test_valid_response(monkeypatch, settings, doc):
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(VALID_SPEC))))

  spec = analyze(doc, settings)

  assert isinstance(spec, FormSpec)
  assert spec.pages[0].sections[0].fields[1].show_if[0].field == "czy_dotyczy"
  assert len(requests) == 1
  sent = requests[0]
  assert sent["url"] == "https://llm.test/v1/chat/completions"
  assert sent["headers"]["authorization"] == "Bearer test-key"
  assert sent["body"]["model"] == "test-model"
  assert sent["body"]["temperature"] == 0
  assert sent["body"]["response_format"]["json_schema"]["schema"] == FormSpec.model_json_schema()
  assert "WNIOSEK O TESTOWE ZEZWOLENIE" in sent["body"]["messages"][-1]["content"]


def test_markdown_fences_are_stripped(monkeypatch, settings, doc):
  fenced = "```json\n" + json.dumps(VALID_SPEC) + "\n```"
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(fenced)))

  assert analyze(doc, settings).title == VALID_SPEC["title"]


def test_invalid_response_is_retried_with_error(monkeypatch, settings, doc):
  bad = {**VALID_SPEC, "pages": [{"title": "X", "sections": [{"key": "s", "title": "S", "fields": [
    {"key": "f", "label": "F", "type": "WRONG_TYPE", "required": True},
  ]}]}]}

  def handler(req, n):
    return httpx.Response(200, json=completion(json.dumps(bad if n == 1 else VALID_SPEC)))

  requests = mock_llm(monkeypatch, handler)

  spec = analyze(doc, settings)

  assert spec.title == VALID_SPEC["title"]
  assert len(requests) == 2
  retry_messages = requests[1]["body"]["messages"]
  assert retry_messages[-2]["role"] == "assistant"
  assert "WRONG_TYPE" in retry_messages[-2]["content"]
  assert retry_messages[-1]["role"] == "user"
  assert "type" in retry_messages[-1]["content"]


def test_invalid_twice_raises(monkeypatch, settings, doc):
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion("to nie jest JSON")))

  with pytest.raises(AppError) as err:
    analyze(doc, settings)

  assert err.value.code == "LLM_INVALID_RESPONSE"
  assert err.value.status == 502
  assert len(requests) == 2


def test_api_json_validation_error_is_retried(monkeypatch, settings, doc):
  def handler(req, n):
    if n == 1:
      return httpx.Response(400, json={"error": {
        "code": "json_validate_failed", "message": "Failed to generate JSON", "failed_generation": "{\"title\": ",
      }})
    return httpx.Response(200, json=completion(json.dumps(VALID_SPEC)))

  requests = mock_llm(monkeypatch, handler)

  assert analyze(doc, settings).title == VALID_SPEC["title"]
  assert len(requests) == 2


def test_falls_back_to_json_object_when_schema_unsupported(monkeypatch, settings, doc):
  def handler(req, n):
    if json.loads(req.content)["response_format"]["type"] == "json_schema":
      return httpx.Response(400, json={"error": {"message": "This model does not support response_format `json_schema`"}})
    return httpx.Response(200, json=completion(json.dumps(VALID_SPEC)))

  requests = mock_llm(monkeypatch, handler)

  assert analyze(doc, settings).title == VALID_SPEC["title"]
  assert [r["body"]["response_format"]["type"] for r in requests] == ["json_schema", "json_object"]


def test_timeout_raises_llm_unavailable(monkeypatch, settings, doc):
  def handler(req, n):
    raise httpx.ReadTimeout("timed out", request=req)

  mock_llm(monkeypatch, handler)

  with pytest.raises(AppError) as err:
    analyze(doc, settings)

  assert err.value.code == "LLM_UNAVAILABLE"
  assert err.value.status == 503


def test_connection_error_raises_llm_unavailable(monkeypatch, settings, doc):
  def handler(req, n):
    raise httpx.ConnectError("refused", request=req)

  mock_llm(monkeypatch, handler)

  with pytest.raises(AppError) as err:
    analyze(doc, settings)

  assert (err.value.code, err.value.status) == ("LLM_UNAVAILABLE", 503)


@pytest.mark.parametrize("status", [429, 500, 503])
def test_rate_limit_and_server_errors_raise_llm_unavailable(monkeypatch, settings, doc, status):
  mock_llm(monkeypatch, lambda req, n: httpx.Response(status, json={"error": {"message": "busy"}}))

  with pytest.raises(AppError) as err:
    analyze(doc, settings)

  assert (err.value.code, err.value.status) == ("LLM_UNAVAILABLE", 503)


def test_bad_api_key_raises_config_error(monkeypatch, settings, doc):
  mock_llm(monkeypatch, lambda req, n: httpx.Response(401, json={"error": {"message": "Invalid API Key"}}))

  with pytest.raises(AppError) as err:
    analyze(doc, settings)

  assert err.value.code == "LLM_CONFIG"


def test_empty_document_skips_llm(monkeypatch, settings):
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(VALID_SPEC))))

  with pytest.raises(AppError) as err:
    analyze(ExtractedDocument(format=FileFormat.PDF, blocks=[]), settings)

  assert err.value.code == "EMPTY_DOCUMENT"
  assert requests == []
