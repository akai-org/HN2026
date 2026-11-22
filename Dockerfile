FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14.10-slim-trixie

RUN pip install --no-cache-dir uv==0.13.3

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  tesseract-ocr \
  tesseract-ocr-pol \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system appuser \
  && useradd --system --gid appuser --create-home appuser

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_PYTHON_DOWNLOADS=never \
  HOST=0.0.0.0 \
  PORT=3000

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ ./src/
COPY --from=frontend /app/src/hacknation_2026/static ./src/hacknation_2026/static
RUN uv sync --frozen --no-dev \
  && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health')"]

CMD ["/app/.venv/bin/hacknation-2026"]