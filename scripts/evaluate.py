"""Runs every sample form through the pipeline, saves the results and reports their quality.

Usage: uv run python scripts/evaluate.py [--out wyniki/] [--only 1,5] [--workers 3]   (uses the LLM from .env)

- wyniki/<form>/<file>.json : ConvertResult of every file (needed for the submission), or {"code", "message"} on error,
- forms 1 and 5: similarity to the reference JSONs (page titles, field labels, types of matched fields, states),
- every form: rule violations (check_form) and agreement of field labels between formats of the same form,
- a table in the console and wyniki/raport.json.
"""

import argparse
import json
import pathlib
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

from hacknation_2026 import pipeline
from hacknation_2026.config import get_settings
from hacknation_2026.contracts import AppError
from hacknation_2026.rules import check_form

BLANKIETY = pathlib.Path(__file__).parents[1] / "dane_zadania" / "blankiety"
SKIP = ("wizualizacja",)   # the task's visualisations are not forms to convert


def norm(text: str) -> str:
  ascii_text = unicodedata.normalize("NFKD", text.lower().replace("ł", "l")).encode("ascii", "ignore").decode()
  return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


def fields(form: dict) -> list[dict]:
  """Every input field (sections excluded), with nested ones from repeatingSectionGrid."""
  out = []
  def walk(field):
    for child in field.get("repeatingSectionGrid") or []:
      walk(child["field"])
    if field.get("type") not in ("SECTION", "REPEATING_SECTION"):
      out.append(field)
  for tab in form.get("tabs", []):
    for question in tab.get("questions", []):
      walk(question["field"])
  return out


def compare(form: dict, reference: dict) -> dict:
  """Similarity to a reference FormDefinition: shares in 0..1, plus the numbers of states."""
  ref_tabs, tabs = {norm(t["title"]) for t in reference["tabs"]}, {norm(t["title"]) for t in form["tabs"]}
  ref_fields = {norm(f["title"]): f for f in fields(reference) if f.get("title")}
  got_fields = {norm(f["title"]): f for f in fields(form) if f.get("title")}
  matched = ref_fields.keys() & got_fields.keys()
  states = lambda fs: sum(len(f.get("states") or []) for f in fs)
  return {
    "strony": round(len(ref_tabs & tabs) / len(ref_tabs), 2),
    "etykiety": round(len(matched) / len(ref_fields), 2),
    "typy": round(sum(ref_fields[k]["type"] == got_fields[k]["type"] for k in matched) / len(matched), 2) if matched else 0.0,
    "states": f"{states(fields(form))}/{states(fields(reference))}",
  }


def convert(path: pathlib.Path, out_dir: pathlib.Path, settings) -> dict:
  start = time.time()
  row = {"formularz": path.parent.name.split(".")[0], "plik": path.name}
  try:
    result = pipeline.convert(path.name, path.read_bytes(), settings)
    body = result.model_dump()
    row.update(status=200, tytul=result.form["title"], pola=len(fields(result.form)),
               naruszenia=len(check_form(result.form)), etykiety={norm(f["title"]) for f in fields(result.form) if f.get("title")})
  except AppError as exc:
    body = {"code": exc.code, "message": exc.message}
    row.update(status=exc.status, blad=exc.code)
  row["czas_s"] = round(time.time() - start)
  target = out_dir / path.parent.name / f"{path.name}.json"
  target.parent.mkdir(parents=True, exist_ok=True)
  target.write_text(json.dumps(body, ensure_ascii=False, indent=2))
  row["wynik"] = body
  return row


def sample_files(only: set[str] | None) -> list[pathlib.Path]:
  files = []
  for path in sorted(BLANKIETY.glob("*/*")):
    if (path.is_file() and not path.name.startswith((".", "~$")) and path.suffix.lower() != ".json"
        and not any(s in path.name for s in SKIP) and (not only or path.parent.name.split(".")[0] in only)):
      files.append(path)
  return files


def report(rows: list[dict]) -> dict:
  """Per form: results per format, agreement between formats (Jaccard of labels) and similarity to the reference."""
  forms = {}
  for row in rows:
    forms.setdefault(row["formularz"], []).append(row)
  out = {}
  for name, form_rows in sorted(forms.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
    ok = [r for r in form_rows if r["status"] == 200]
    labels = [r["etykiety"] for r in ok]
    pairs = [(a, b) for i, a in enumerate(labels) for b in labels[i + 1:]]
    agreement = round(sum(len(a & b) / len(a | b) for a, b in pairs if a | b) / len(pairs), 2) if pairs else None
    entry = {
      "pliki": [{k: r.get(k) for k in ("plik", "status", "blad", "tytul", "pola", "naruszenia", "czas_s")} for r in form_rows],
      "zgodnosc_formatow": agreement,
      "naruszenia": sum(r["naruszenia"] for r in ok),
    }
    reference = next(BLANKIETY.glob(f"{name}.*/konfiguracja_form_*.json"), None)
    if reference and ok:
      ref = json.loads(reference.read_text())
      entry["wzorzec"] = {r["plik"]: compare(r["wynik"]["form"], ref) for r in ok}
    out[name] = entry
  return out


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument("--out", default="wyniki", type=pathlib.Path)
  parser.add_argument("--only", help="numery formularzy, np. 1,5")
  parser.add_argument("--workers", type=int, default=3)
  args = parser.parse_args()
  settings = get_settings()
  files = sample_files(set(args.only.split(",")) if args.only else None)
  print(f"{len(files)} plików, wyniki w {args.out}/", file=sys.stderr)
  with ThreadPoolExecutor(args.workers) as pool:
    rows = list(pool.map(lambda p: convert(p, args.out, settings), files))

  summary = report(rows)
  (args.out / "raport.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
  print(f"\n{'form.':5} {'plik':45} {'status':12} {'pól':>4} {'narusz.':>7} {'czas':>5}")
  for name, entry in summary.items():
    for f in entry["pliki"]:
      status = str(f["status"]) + (f" {f['blad']}" if f.get("blad") else "")
      print(f"{name:5} {f['plik'][:45]:45} {status:12} {f.get('pola') or '':>4} {f.get('naruszenia') if f.get('naruszenia') is not None else '':>7} {f['czas_s']:>4}s")
    print(f"      zgodność etykiet między formatami: {entry['zgodnosc_formatow']}")
    for plik, sim in entry.get("wzorzec", {}).items():
      print(f"      vs wzorzec ({plik[-14:]}): strony {sim['strony']}, etykiety {sim['etykiety']}, typy {sim['typy']}, states {sim['states']}")
  print(f"\nRaport: {args.out / 'raport.json'}")


if __name__ == "__main__":
  main()
