from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from hacknation_2026.api import router
from hacknation_2026.contracts import AppError

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Cyfryzacja Formularzy")
app.include_router(router, prefix="/api")


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
  return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})


class SpaStaticFiles(StaticFiles):
  """Static files with an index.html fallback, so client-side routes (e.g. /konwerter/sprawdz) survive a reload."""

  async def get_response(self, path: str, scope):
    try:
      return await super().get_response(path, scope)
    except StarletteHTTPException as exc:
      # Unknown /api paths stay 404; everything else is a frontend route.
      if exc.status_code != 404 or path == "api" or path.startswith("api/"):
        raise
      return await super().get_response("index.html", scope)


# Mount last so /api routes win; skipped when the frontend has not been built yet.
if STATIC_DIR.is_dir():
  app.mount("/", SpaStaticFiles(directory=STATIC_DIR, html=True), name="static")
