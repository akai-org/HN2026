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
  monkeypatch.setattr(client.time, "sleep", lambda _: None)
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


def test_half_fenced_reply_is_parsed(monkeypatch, settings, doc):
  # EdenAI's Gemma answers ' {...}\n```' (closing fence only)
  half = " " + json.dumps(VALID_SPEC) + "\n```"
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(half)))
  assert analyze(doc, settings).title == VALID_SPEC["title"]


def test_full_endpoint_url_is_not_doubled(monkeypatch, settings, doc):
  seen = []
  settings.llm_base_url = "https://llm.test/v3/chat/completions"
  mock_llm(monkeypatch, lambda req, n: seen.append(str(req.url)) or httpx.Response(200, json=completion(json.dumps(VALID_SPEC))))
  analyze(doc, settings)
  assert seen == ["https://llm.test/v3/chat/completions"]


def test_garbled_condition_option_is_matched_to_the_real_option(monkeypatch, settings, doc):
  spec = {"title": "Wniosek o zwrot", "pages": [{"title": "Zwrot", "sections": [{"key": "s", "title": "Sposób", "fields": [
    {"key": "sposob", "label": "Sposób zwrotu", "type": "RADIO", "required": True,
     "options": ["Zaliczyć na poczet zobowiązania", "Zwrócić przelewem na wskazany rachunek"]},
    {"key": "rachunek", "label": "Numer rachunku", "type": "TEXT_FIELD", "required": True,
     "show_if": [{"field": "sposob", "equals": "zwrócić przelewem na wskazacheteur rachunek"}]},
    {"key": "inne", "label": "Inne", "type": "TEXT_FIELD", "required": False,
     "show_if": [{"field": "sposob", "equals": "coś zupełnie innego"}]},
  ]}]}]}
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(spec))))
  fields = analyze(doc, settings).pages[0].sections[0].fields
  assert fields[1].show_if[0].equals == "Zwrócić przelewem na wskazany rachunek"
  assert fields[2].show_if[0].equals == "coś zupełnie innego"   # no close option: left as is


def test_rate_limit_is_retried(monkeypatch, settings, doc):
  waits = []
  monkeypatch.setattr(client.time, "sleep", waits.append)
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(429) if n < 3 else
                      httpx.Response(200, json=completion(json.dumps(VALID_SPEC))))

  assert analyze(doc, settings).title == VALID_SPEC["title"]
  assert len(requests) == 3 and waits == list(client.RATE_LIMIT_WAITS_S[:2])


def test_options_are_capitalized_and_conditions_follow(monkeypatch, settings, doc):
  spec = {**VALID_SPEC, "pages": [{"title": "S", "sections": [{"key": "s", "title": "S", "fields": [
    {"key": "sposob", "label": "Wybierz sposób", "type": "RADIO", "required": True, "options": ["zwrócić przelewem", "zaliczyć"]},
    {"key": "konto", "label": "Numer rachunku", "type": "TEXT_FIELD", "required": True,
     "show_if": [{"field": "sposob", "equals": "zwrócić przelewem"}]},
  ]}]}]}
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(spec))))

  fields = analyze(doc, settings).pages[0].sections[0].fields
  assert fields[0].options == ["Zwrócić przelewem", "Zaliczyć"]
  assert fields[1].show_if[0].equals == "Zwrócić przelewem"


def test_single_checkbox_gets_an_option_and_brand_names_keep_casing(monkeypatch, settings, doc):
  spec = {**VALID_SPEC, "pages": [{"title": "S", "sections": [{"key": "s", "title": "S", "fields": [
    {"key": "chodnik", "label": "Chodnik", "type": "CHECKBOX", "required": False},
    {"key": "wymiary", "label": "Wymiary chodnika", "type": "TEXT_FIELD", "required": False,
     "show_if": [{"field": "chodnik", "equals": "true"}]},
    {"key": "kanal", "label": "Wybierz kanał", "type": "RADIO", "required": True, "options": ["eDoręczenia", "ePUAP"]},
  ]}]}]}
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(spec))))

  fields = analyze(doc, settings).pages[0].sections[0].fields
  assert fields[0].options == ["Tak"] and fields[1].show_if[0].equals == "Tak"
  assert fields[2].options == ["eDoręczenia", "ePUAP"]


def test_rate_limit_switches_to_fallback_model(monkeypatch, settings, doc):
  monkeypatch.setattr(client.time, "sleep", lambda _: pytest.fail("should not wait when a fallback model exists"))
  fallback = settings.model_copy(update={"llm_fallback_model": "other/test-model"})
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(429) if json.loads(req.content)["model"] == "test-model"
                      else httpx.Response(200, json=completion(json.dumps(VALID_SPEC))))

  assert analyze(doc, fallback).title == VALID_SPEC["title"]
  assert [r["body"]["model"] for r in requests] == ["test-model", "other/test-model"]


LONG_DOC = ExtractedDocument(format=FileFormat.PDF, blocks=[
  Block(kind="text", text="WNIOSEK O TESTOWE ZEZWOLENIE", page=1),
  Block(kind="text", text="Opis ____", page=1),
  *[Block(kind="text", text=f"Liczba gospodarstw domowych w lokalu nr {n} ____", page=2) for n in range(6)],
  Block(kind="checkbox", text="Załącznik kalkulacyjny", page=2),
])
MISSING_PAGES = {"pages": [{"title": "Obliczenie opłaty", "sections": [{"key": "sprawa", "title": "Gospodarstwa", "fields": [
  {"key": "opis", "label": "Opis", "type": "TEXTAREA", "required": True},                       # repeats an existing field
  {"key": "liczba_gospodarstw", "label": "Liczba gospodarstw domowych", "type": "NUMBER", "required": True},
  {"key": "czy_dotyczy", "label": "Załącznik kalkulacyjny", "type": "FILE_UPLOADER", "required": False},  # key collision
]}]}]}


def test_long_form_with_a_gap_gets_one_completion_request(monkeypatch, settings):
  def handler(req, n):
    return httpx.Response(200, json=completion(json.dumps(VALID_SPEC if n == 1 else MISSING_PAGES)))

  requests = mock_llm(monkeypatch, handler)
  spec = analyze(LONG_DOC, settings)

  assert len(requests) == 2
  follow_up = requests[1]["body"]
  assert list(follow_up["response_format"]["json_schema"]["schema"]["properties"]) == ["pages"]
  assert "(strona 2) Liczba gospodarstw domowych w lokalu nr 0 ____" in follow_up["messages"][-1]["content"]
  assert follow_up["messages"][-2] == {"role": "assistant", "content": json.dumps(VALID_SPEC)}
  added = spec.pages[1]
  assert added.title == "Obliczenie opłaty" and added.sections[0].key == "sprawa_2"
  assert [(f.key, f.label) for f in added.sections[0].fields] == [
    ("liczba_gospodarstw", "Liczba gospodarstw domowych"), ("czy_dotyczy_2", "Załącznik kalkulacyjny")]


def test_completion_failure_keeps_the_first_answer(monkeypatch, settings):
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(VALID_SPEC))) if n == 1
                      else httpx.Response(500))
  spec = analyze(LONG_DOC, settings)
  assert len(requests) == 2 and [p.title for p in spec.pages] == ["Informacje o sprawie"]


def test_covered_form_needs_no_completion(monkeypatch, settings):
  covering = {**VALID_SPEC, "pages": VALID_SPEC["pages"] + MISSING_PAGES["pages"]}
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(covering))))
  analyze(LONG_DOC, settings)
  assert len(requests) == 1


def test_model_verdict_not_a_form_is_rejected_without_completion(monkeypatch, settings):
  menu = {"is_form": False, "not_form_reason": "menu restauracji.", "title": "Karta menu", "pages": [], "consents": []}
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(menu))))
  with pytest.raises(AppError) as err:
    analyze(LONG_DOC, settings)   # LONG_DOC would otherwise trigger the completion request
  assert (err.value.code, err.value.status) == ("NOT_A_FORM", 422)
  assert err.value.message == "Plik nie wygląda na formularz do wypełnienia (menu restauracji)."
  assert len(requests) == 1


@pytest.mark.parametrize("title,rejected", [
  ("Program konferencji", True),             # not the title of a form
  ("OFERTA", True),                          # a price list, even though the model found fields in it
  ("", True),                                # no title at all
  ("Wniosek o wydanie zaświadczenia", False),  # a real form may hold only applicant data, which the builder adds
  ("DEKLARACJA o wysokości opłaty", False),
  ("Formularz ofertowy – dostawa sprzętu", False),
])
def test_answer_is_rejected_unless_titled_as_a_form(monkeypatch, settings, doc, title, rejected):
  spec = {**VALID_SPEC, "title": title}
  mock_llm(monkeypatch, lambda req, n: httpx.Response(200, json=completion(json.dumps(spec))))
  if rejected:
    with pytest.raises(AppError) as err:
      analyze(doc, settings)
    assert err.value.code == "NOT_A_FORM" and err.value.status == 422
  else:
    assert analyze(doc, settings).title == title


def test_very_long_document_is_rejected_before_the_llm(monkeypatch, settings):
  requests = mock_llm(monkeypatch, lambda req, n: httpx.Response(500))
  manual = ExtractedDocument(format=FileFormat.PDF, blocks=[Block(kind="text", text="Instrukcja obsługi pralki. " * 3000)])
  with pytest.raises(AppError) as err:
    analyze(manual, settings)
  assert err.value.code == "NOT_A_FORM" and "tys. znaków" in err.value.message
  assert not requests
