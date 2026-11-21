from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from hacknation_2026.api import router
from hacknation_2026.contracts import AppError

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Cyfryzacja Formularzy")
app.include_router(router, prefix="/api")


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
  return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})


# Mount last so /api routes win; skipped when the frontend has not been built yet.
if STATIC_DIR.is_dir():
  app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
