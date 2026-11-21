"""Scores scripts/prompt_eval/<tag>/ results of forms 1 and 5 against their reference JSONs.

Usage: uv run python scripts/prompt_score.py <tag> [<tag> ...]
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parents[1]
BLANKIETY = ROOT / "dane_zadania" / "blankiety"
_WORD = re.compile(r"[0-9a-ząćęłńóśźż]{3,}")
# Expected from the reference JSONs: both offer self / other person / legal entity and a proxy section.
EXPECTED = {"1": {"kind": "ORGAN", "optional": ["ulica"]}, "5": {"kind": "URZAD", "optional": []}}


def gold(form: str) -> dict:
  data = json.loads(next(BLANKIETY.glob(f"{form}.*/konfiguracja_form_*.json")).read_text())
  fields = [q["field"] for tab in data["tabs"][1:-2] for s in tab["questions"] for q in s["field"].get("repeatingSectionGrid", [])]
  return {"title": data["title"], "labels": [f["title"] for f in fields], "dependent": sum(bool(f.get("states")) for f in fields)}


def recall(found: list[str], reference: list[str]) -> float:
  found_words = [set(_WORD.findall(label.lower())) for label in found]
  hits = sum(1 for label in reference
             if any(len(set(_WORD.findall(label.lower())) & f) >= max(1, len(set(_WORD.findall(label.lower()))) // 2)
                    for f in found_words))
  return hits / len(reference)


def title_case(label: str) -> bool:
  words = [w for w in label.split()[1:] if len(w) > 3 and w[0].isalpha()]
  return sum(w[0].isupper() for w in words) >= 2


def score(spec: dict, form: str) -> dict:
  g = gold(form)
  fields = [f for page in spec["pages"] for s in page["sections"] for f in s["fields"]]
  norm = lambda t: " ".join(t.lower().split())
  optional_ok = all(not f["required"] for f in fields for want in EXPECTED[form]["optional"] if norm(f["label"]) == want)
  return {
    "tytuł": norm(spec["title"]) == norm(g["title"]),
    "flagi": spec["allows_other_person"] and spec["allows_legal_entity"],
    "adresat": spec["authority_kind"] == EXPECTED[form]["kind"],
    "pola": round(recall([f["label"] for f in fields], g["labels"]), 2),
    "pisownia": not any(title_case(f["label"]) for f in fields),
    "opcjonalne": optional_ok,
    "zależne": sum(bool(f["show_if"]) for f in fields) >= g["dependent"],
    "opis≠etykieta": not any(f["description"] and norm(f["description"]) == norm(f["label"]) for f in fields),
    "zgody bez RODO": not any("przetwarza" in c.lower() or "zostałem" in c.lower() for c in spec["consents"]),
  }


def main():
  for tag in sys.argv[1:]:
    rows = []
    for path in sorted((ROOT / "scripts" / "prompt_eval" / tag).glob("*.json")):
      form = "1" if "porządkowego" in path.name else "5"
      rows.append((f"{form}{pathlib.Path(path.stem).suffix.lower()}", score(json.loads(path.read_text()), form)))
    print(f"\n== {tag}")
    keys = list(rows[0][1])
    print("plik    | " + " | ".join(keys))
    for name, s in rows:
      print(f"{name:7} | " + " | ".join(f"{s[k]!s:>{len(k)}}" for k in keys))
    ok = sum(v is True for _, s in rows for v in s.values())
    total = sum(isinstance(v, bool) for _, s in rows for v in s.values())
    print(f"spełnione kryteria: {ok}/{total}, średnie pokrycie pól: {sum(s['pola'] for _, s in rows) / len(rows):.2f}")


if __name__ == "__main__":
  main()
