"""Experiment: PaddleOCR document parsing (PaddleOCR-VL, Transformers engine) on one form image or PDF.

Usage: uv run python scripts/paddle_probe.py <file> [cpu|mps]
"""

import sys
import time

from paddleocr import PaddleOCRVL

device = sys.argv[2] if len(sys.argv) > 2 else "mps"   # mps = Apple GPU through PyTorch
start = time.time()
pipeline = PaddleOCRVL(engine="transformers")
# engine_config/device do not reach the sub-models on macOS, so move the loaded torch models by hand.
inner = getattr(pipeline.paddlex_pipeline, "_pipeline", pipeline.paddlex_pipeline)
for name in ("layout_det_model", "vl_rec_model"):
  getattr(inner, name).infer.to(device)
print(f"\n=== model gotowy po {time.time() - start:.0f}s")

start = time.time()
for page in pipeline.predict(sys.argv[1]):
  print(f"\n=== strona ({time.time() - start:.0f}s)")
  print(page.markdown["markdown_texts"])
