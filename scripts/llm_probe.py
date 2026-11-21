"""Experiment (block C): can the local model turn extracted form text into FormSpec?

Usage: uv run python scripts/llm_probe.py <form file> [ollama model]   (needs Ollama on 127.0.0.1:11434)
"""

import json
import pathlib
import sys
import time

import httpx

from hacknation_2026.contracts import FileFormat, FormSpec
from hacknation_2026.extract.image import extract_image
from hacknation_2026.extract.pdf import extract_pdf
from hacknation_2026.extract.sheet import extract_ods, extract_xlsx
from hacknation_2026.extract.word import extract_doc, extract_docx

PROMPT = """Jesteś ekspertem cyfryzacji formularzy urzędowych. Dostajesz tekst papierowego formularza wyciągnięty z pliku.
Zaprojektuj jego wersję elektroniczną jako JSON zgodny ze schematem.

Konwencje w tekście:
- "____" to miejsce do wpisania wartości. Etykieta pola stoi obok (np. "PESEL * ____") albo w nawiasie w linii pod spodem (np. "____" i dalej "(imię i nazwisko)").
- "[ ]" oraz linie z checkboxem to opcje wyboru.
- Wiersze "a | b | c" to tabela.
- Formularz miał kilka kolumn, więc tekst z dwóch kolumn bywa sklejony w jednej linii (np. "(imię i nazwisko) Wójt Gminy X").

Zasady:
- POMIŃ dane wnioskodawcy (imię, nazwisko, PESEL, NIP, adres, telefon, e-mail), datę, miejscowość, podpis, nazwę urzędu, pouczenia i klauzulę RODO. Te elementy system dodaje sam.
  Zamiast nich ustaw:
  - authority_name: urząd lub organ, do którego składany jest wniosek. Zwykle stoi po słowie "Adresat:" albo w prawym górnym rogu, np. "Urząd Gminy X", "Wójt Gminy Y", "Prezydent Miasta Z".
  - authority_kind: ORGAN, gdy adresatem jest osoba-organ (Wójt, Burmistrz, Prezydent, Starosta), w przeciwnym razie URZAD.
  - allows_legal_entity: true, jeśli przy danych wnioskodawcy jest mowa o firmie lub instytucji (np. "nazwa firmy", "nazwa wnioskodawcy", "siedziba", NIP, REGON).
  - allows_other_person, allows_proxy: true, jeśli formularz przewiduje składanie w czyimś imieniu lub przez pełnomocnika.
- W "pages" umieść TYLKO strony merytoryczne (to, czego dotyczy sprawa), pogrupowane w tematyczne sekcje.
- Typy pól: TEXT_FIELD (krótki tekst), TEXTAREA (dłuższy opis, uzasadnienie, kilka pustych linii), NUMBER (kwoty, liczby), DATEPICKER (daty),
  RADIO (jedna opcja z kilku, do 5 opcji), CHECKBOX (wiele opcji), SELECT (jedna opcja z ponad 5), FILE_UPLOADER (załączniki), TEXT_BLOCK (informacja bez wpisywania).
- Jeśli opcja wyboru wymaga dopisania danych (np. "z tytułu ...", "na wskazany rachunek"), dodaj osobne pole z show_if: key pola wyboru i dokładna nazwa opcji.
- Każdy wymieniony z nazwy załącznik to osobne pole FILE_UPLOADER. Puste pozycje listy (np. "2) ____") pomiń.
- Oświadczenia i zgody do zaakceptowania wpisz do "consents".
- title: przepisz tytuł z nagłówka formularza (linia zaczynająca się od WNIOSEK, ZGŁOSZENIE, DEKLARACJA lub OŚWIADCZENIE), bez podstawy prawnej.
- Pisownia polska: wielka litera tylko na początku i w nazwach własnych, np. "Kwota nadpłaty", "Wniosek o stwierdzenie nadpłaty podatku" (nie "Kwota Nadpłaty").
- Etykiety pól pisz prostym językiem. key: snake_case bez polskich znaków, unikalny.

Tekst formularza:
"""


def extract(path: pathlib.Path):
  data, ext = path.read_bytes(), path.suffix.lower()
  if ext == ".pdf":
    return extract_pdf(data)
  if ext in (".png", ".jpg", ".jpeg"):
    return extract_image(data, FileFormat.PNG)
  if ext in (".xlsx", ".ods"):
    return extract_xlsx(data) if ext == ".xlsx" else extract_ods(data)
  return extract_doc(data) if ext == ".doc" else extract_docx(data)


def main():
  path = pathlib.Path(sys.argv[1])
  model = sys.argv[2] if len(sys.argv) > 2 else "hf.co/unsloth/gemma-4-E4B-it-GGUF:UD-Q8_K_XL"
  text = extract(path).as_text()
  start = time.time()
  response = httpx.post("http://127.0.0.1:11434/api/chat", timeout=600, json={
    "model": model, "stream": False, "format": FormSpec.model_json_schema(),
    "options": {"temperature": 0, "num_ctx": 16384},
    "messages": [{"role": "user", "content": PROMPT + text}],
  }).json()
  elapsed = time.time() - start
  raw = response["message"]["content"]
  try:
    spec = FormSpec.model_validate_json(raw)
  except Exception as exc:
    print(f"NIEPOPRAWNY JSON po {elapsed:.0f}s: {exc}\n{raw[:2000]}")
    return
  print(f"model={model} czas={elapsed:.0f}s tokeny_we={response.get('prompt_eval_count')} wy={response.get('eval_count')}")
  print(f"title={spec.title!r} authority={spec.authority_name!r}/{spec.authority_kind} "
        f"other={spec.allows_other_person} legal={spec.allows_legal_entity} proxy={spec.allows_proxy}")
  for page in spec.pages:
    print(f"STRONA: {page.title}")
    for section in page.sections:
      print(f"  SEKCJA: {section.title}")
      for f in section.fields:
        cond = f" | pokaż gdy {f.show_if[0].field} = {f.show_if[0].equals}" if f.show_if else ""
        print(f"    {f.type:13} {f.label} {'*' if f.required else ''} {f.options or ''}{cond}")
  print("ZGODY:", spec.consents)
  print(raw)  # full FormSpec JSON


main()
