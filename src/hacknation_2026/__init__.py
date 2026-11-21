import os

def main() -> None:
  import uvicorn

  uvicorn.run("hacknation_2026.app:app", host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "3000")))
