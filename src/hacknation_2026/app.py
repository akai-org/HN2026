from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from hacknation_2026.api import router

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Cyfryzacja Formularzy")
app.include_router(router, prefix="/api")

# Mount last so /api routes win; skipped when the frontend has not been built yet.
if STATIC_DIR.is_dir():
  app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
