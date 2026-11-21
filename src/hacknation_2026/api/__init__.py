from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool

from hacknation_2026 import pipeline
from hacknation_2026.config import Settings, get_settings
from hacknation_2026.contracts import AppError, ConvertResult

router = APIRouter()
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health")
def health(settings: SettingsDep) -> dict[str, str]:
  return {"status": "ok", "llm": _llm_status(settings)}


def _llm_status(settings: Settings) -> str:
  """`ok` when the OpenAI-compatible API lists models with our key, otherwise `unavailable`."""
  try:
    base = settings.llm_base_url.rstrip("/").removesuffix("/chat/completions")   # the URL may be the full endpoint
    response = httpx.get(base + "/models", timeout=3,
                         headers={"Authorization": f"Bearer {settings.llm_api_key}"})
  except httpx.HTTPError:
    return "unavailable"
  return "ok" if response.status_code == 200 else "unavailable"


@router.post("/forms/convert")
async def convert(settings: SettingsDep, file: Annotated[UploadFile, File()]) -> ConvertResult:
  # Read at most one byte past the limit so a huge upload is never held in memory whole.
  data = await file.read(settings.max_file_size_bytes + 1)
  if len(data) > settings.max_file_size_bytes:
    raise AppError("FILE_TOO_LARGE", f"Plik przekracza limit {settings.max_file_size_mb} MB", 413)
  return await run_in_threadpool(pipeline.convert, file.filename or "", data, settings)
