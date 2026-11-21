"""Block C prompt check: extraction + analyze() on chosen files, printing what matters for the reference JSONs.

Usage: uv run python scripts/prompt_eval.py <tag> <file> [<file> ...]   (uses the LLM from .env)
Results go to scripts/prompt_eval/<tag>/<file name>.json for comparison.
"""

import json
import pathlib
import sys
import time

from hacknation_2026.ai import analyze
from hacknation_2026.config import get_settings
from hacknation_2026.extract import extract_document
from hacknation_2026.ingest.validation import detect_format

settings = get_settings()
out_dir = pathlib.Path(__file__).parent / "prompt_eval" / sys.argv[1]
out_dir.mkdir(parents=True, exist_ok=True)
for name in sys.argv[2:]:
  path = pathlib.Path(name)
  data = path.read_bytes()
  start = time.time()
  spec = analyze(extract_document(data, detect_format(data), settings.ocr_lang), settings)
  (out_dir / f"{path.name}.json").write_text(spec.model_dump_json(indent=1))
  print(f"\n=== {path.parent.name[:2]}{path.suffix} ({time.time() - start:.0f}s)")
  print(f"tytuł: {spec.title!r} | organ: {spec.authority_name!r} {spec.authority_kind}"
        f" | inna osoba={spec.allows_other_person} firma={spec.allows_legal_entity} pełnomocnik={spec.allows_proxy}")
  for page in spec.pages:
    for section in page.sections:
      print(f"  [{page.title} / {section.title}]")
      for f in section.fields:
        cond = f" | gdy {f.show_if[0].field}={f.show_if[0].equals}" if f.show_if else ""
        desc = f" | opis: {f.description[:40]!r}" if f.description else ""
        print(f"    {f.type:13} {f.label}{'' if f.required else ' (opcjonalne)'} {f.options or ''}{cond}{desc}")
  print(f"  zgody: {[c[:60] for c in spec.consents]}")
