import importlib.util
import json
import pathlib

from hacknation_2026.contracts import AppError, ConvertResult

ROOT = pathlib.Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location("evaluate", ROOT / "scripts" / "evaluate.py")
evaluate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluate)
REFERENCE = json.loads(next(evaluate.BLANKIETY.glob("5.*/konfiguracja_form_*.json")).read_text())


def test_end_to_end_on_mocked_convert(tmp_path, monkeypatch):
  def fake_convert(filename, data, settings):
    if filename.lower().endswith(".png"):
      raise AppError("NOT_A_FORM", "Plik nie wygląda na formularz.", 422)
    return ConvertResult(form=REFERENCE)   # the reference itself: perfect similarity, 0 violations of the builder's rules
  monkeypatch.setattr(evaluate.pipeline, "convert", fake_convert)
  monkeypatch.setattr(evaluate, "get_settings", lambda: None)
  monkeypatch.setattr("sys.argv", ["evaluate.py", "--out", str(tmp_path), "--only", "5", "--workers", "1"])

  evaluate.main()

  report = json.loads((tmp_path / "raport.json").read_text())["5"]
  saved = list(tmp_path.glob("5.*/*.json"))
  assert len(saved) == len(report["pliki"]) > 3
  assert {f["status"] for f in report["pliki"]} == {200, 422}
  assert report["zgodnosc_formatow"] == 1.0
  assert all(s["etykiety"] == 1.0 and s["typy"] == 1.0 and s["strony"] == 1.0 for s in report["wzorzec"].values())
  error = json.loads(next(p for p in saved if p.name.lower().endswith(".png.json")).read_text())
  assert error["code"] == "NOT_A_FORM"
