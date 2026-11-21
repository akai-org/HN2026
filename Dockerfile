FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim
# OCR of scanned PDFs and images (pytesseract calls the tesseract program, Polish language data)
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-pol \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ ./src/
COPY --from=frontend /app/src/hacknation_2026/static ./src/hacknation_2026/static
RUN uv sync --frozen --no-dev
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["uv", "run", "--no-sync", "hacknation-2026"]
