from pathlib import Path, PurePosixPath

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from hacknation_2026.api import router
from hacknation_2026.contracts import AppError

STATIC_DIR = Path(__file__).parent / "static"


class SpaStaticFiles(StaticFiles):
  """Built frontend. A route of the client-side router (e.g. /verify) gets index.html, so reloading the page works;
  missing files (names with an extension) and unknown /api paths stay 404."""

  async def get_response(self, path: str, scope):
    try:
      return await super().get_response(path, scope)
    except HTTPException as error:
      route = PurePosixPath(path)
      if error.status_code != 404 or route.parts[:1] == ("api",) or "." in route.name:
        raise
      return await super().get_response("index.html", scope)

app = FastAPI(title="Cyfryzacja Formularzy")
app.include_router(router, prefix="/api")


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
  return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})


# Mount last so /api routes win; skipped when the frontend has not been built yet.
if STATIC_DIR.is_dir():
  app.mount("/", SpaStaticFiles(directory=STATIC_DIR, html=True), name="static")
