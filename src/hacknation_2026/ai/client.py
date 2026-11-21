"""HTTP client for an OpenAI-compatible chat API (Groq, or local Ollama at /v1)."""

from typing import Any

import httpx

from hacknation_2026.config import Settings
from hacknation_2026.contracts import AppError

Message = dict[str, str]


class LLMOutputError(Exception):
  """The model produced output the API itself rejected as invalid JSON (worth a retry)."""

  def __init__(self, message: str, output: str = ""):
    super().__init__(message)
    self.output = output


def _make_client(settings: Settings) -> httpx.Client:
  """Separate factory so tests can swap in httpx.MockTransport."""
  return httpx.Client(timeout=settings.llm_timeout_s)


def _response_format(schema: dict[str, Any] | None) -> dict[str, Any]:
  if schema is None:
    return {"type": "json_object"}
  return {"type": "json_schema", "json_schema": {"name": "FormSpec", "schema": schema}}


def _error_detail(response: httpx.Response) -> tuple[str, str, str]:
  """Returns (code, message, failed_generation) from an OpenAI-style error body."""
  try:
    error = response.json().get("error") or {}
  except ValueError:
    return "", response.text[:300], ""
  if not isinstance(error, dict):
    return "", str(error)[:300], ""
  return str(error.get("code") or ""), str(error.get("message") or "")[:300], str(error.get("failed_generation") or "")


def _post(client: httpx.Client, settings: Settings, payload: dict[str, Any]) -> httpx.Response:
  url = settings.llm_base_url.rstrip("/") + "/chat/completions"
  headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
  try:
    return client.post(url, json=payload, headers=headers)
  except httpx.TimeoutException as exc:
    raise AppError("LLM_UNAVAILABLE", f"Model językowy nie odpowiedział w czasie {settings.llm_timeout_s} s.", 503) from exc
  except httpx.HTTPError as exc:
    raise AppError("LLM_UNAVAILABLE", f"Brak połączenia z modelem językowym: {exc}", 503) from exc


def chat(messages: list[Message], settings: Settings, schema: dict[str, Any] | None = None) -> str:
  """Sends a chat request and returns the assistant's text.

  Asks for JSON matching `schema`; if the model does not support JSON-schema output,
  falls back once to plain JSON mode (the schema is described in the prompt anyway).
  """
  payload: dict[str, Any] = {
    "model": settings.llm_model,
    "messages": messages,
    "temperature": 0,
    "stream": False,
    "response_format": _response_format(schema),
  }
  with _make_client(settings) as client:
    response = _post(client, settings, payload)
    if response.status_code == 400 and schema is not None:
      code, message, _ = _error_detail(response)
      if code != "json_validate_failed" and ("json_schema" in message or "response_format" in message):
        payload["response_format"] = _response_format(None)
        response = _post(client, settings, payload)

  if response.status_code in (401, 403):
    raise AppError("LLM_CONFIG", "Model językowy odrzucił klucz API (sprawdź LLM_API_KEY w .env).", 500)
  if response.status_code == 429 or response.status_code >= 500:
    raise AppError("LLM_UNAVAILABLE", f"Model językowy jest niedostępny (HTTP {response.status_code}).", 503)
  if response.status_code >= 400:
    code, message, failed = _error_detail(response)
    if code == "json_validate_failed":
      raise LLMOutputError(message or "Model zwrócił niepoprawny JSON.", failed)
    raise AppError("LLM_ERROR", f"Model językowy zwrócił błąd HTTP {response.status_code}: {message}", 502)

  try:
    content = response.json()["choices"][0]["message"]["content"]
  except (ValueError, KeyError, IndexError, TypeError) as exc:
    raise AppError("LLM_ERROR", "Nieoczekiwany format odpowiedzi modelu językowego.", 502) from exc
  if not isinstance(content, str):
    raise AppError("LLM_ERROR", "Model językowy zwrócił pustą odpowiedź.", 502)
  return content
