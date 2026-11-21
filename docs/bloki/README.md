# Bloki implementacji

Każdy plik opisuje jeden blok do zrobienia przez niezależnego agenta. Agent dostaje **tylko swój plik** (jest samowystarczalny). Kolejność: najpierw blok 0, potem reszta równolegle.

| Blok | Zakres |
|---|---|
| [0](00-kontrakty.md) | Kontrakty – **zrobione** |
| [A](A-walidacja-pliku.md) | Walidacja pliku – **zrobione** |
| [B1](B1-ekstrakcja-pdf-obrazy.md) | Ekstrakcja: PDF i obrazy |
| [B2](B2-ekstrakcja-word.md) | Ekstrakcja: DOCX i DOC |
| [B3](B3-ekstrakcja-arkusze.md) | Ekstrakcja: XLSX i ODS |
| [C](C-analiza-llm.md) | Analiza LLM |
| [D](D-builder.md) | Builder FormDefinition |
| [E](E-wzbogacanie-pol.md) | Wzbogacanie pól |
| [F](F-kontrola-regul.md) | Kontrola reguł |
| [G](G-api-pipeline.md) | API i pipeline |
| [H](H-docker-readme.md) | Docker, compose, README |
| [I](I-ewaluacja.md) | Ewaluacja |

## Mapa zależności

```
                   ┌─ A  walidacja pliku
                   ├─ B1 ekstrakcja PDF + obrazy (OCR)
                   ├─ B2 ekstrakcja DOCX + DOC
                   ├─ B3 ekstrakcja XLSX + ODS
0 kontrakty ──────►├─ C  analiza LLM
                   ├─ D  builder FormDefinition ◄── używa E (do czasu E: stub w D)
                   ├─ E  wzbogacanie pól (słowniki, dane inicjalne, walidatory)
                   ├─ F  kontrola reguł
                   ├─ G  API, pipeline (spina A–F; do tego czasu stuby)
                   ├─ H  Docker, compose z Ollamą, README
                   └─ I  skrypt ewaluacji (woła pipeline z G)
```
