# Wybór modelu – pierwsze próby (2026-11-21)

Skrypt: `scripts/llm_probe.py <plik> [model]`. Bierze ekstrakcję z bloków B1/B2, wysyła ją do lokalnej Ollamy z wymuszonym schematem `FormSpec` i drukuje wynik. Sprzęt: Apple M4 Pro, 24 GB RAM.

## gemma-4-E4B (`hf.co/unsloth/gemma-4-E4B-it-GGUF:UD-Q8_K_XL`, 7,5 mld parametrów, Q8)

Czas: 40–65 s na formularz (ok. 1–2 tys. tokenów na wejściu, 1,5–2 tys. na wyjściu).

| Przebieg | Pola merytoryczne (wzorzec) | Metadane |
|---|---|---|
| 5 PDF | ✅ wszystkie 6 pól strony „Informacje o nadpłacie”: TEXT_FIELD, NUMBER, TEXTAREA, RADIO z 2 opcjami, 2 pola zależne z `show_if`; załącznik raz jest, raz go brak | tytuł ✅, urząd ✅, `allows_legal_entity` ❌ (blankiet ma „Nazwa firmy”) |
| 5 PNG (OCR) | ⚠️ typy i RADIO dobrze, ale brak TEXTAREA i jednego pola zależnego: OCR gubi `____`, więc model nie widzi miejsc do wpisania | tytuł ✅, urząd ✅, flaga firmy ❌ |
| 1 PDF | ✅ 4/4 pola („Miejscowość”, „Ulica”, „Numer ewidencyjny działki”, „Obręb”), tylko „Numer ewidencyjny działki” jako NUMBER zamiast TEXT_FIELD | tytuł ✅, organ ❌ („Wójt Gminy Elbląg” sklejony z drugą kolumną) |

Prompt wymagał jednej poprawki: bez wskazówek model pisał „Kwota Nadpłaty” (pisownia angielska), brał tytuł strony zamiast nagłówka i robił pola z pustych pozycji załączników.

## Wnioski dla bloku C

1. **Sedno działa:** mały lokalny model poprawnie zamienia tekst blankietu na pola, typy, opcje i zależności. To była najbardziej ryzykowna część planu.
2. **Metadane wyciągać regułami, nie modelem.** Organ (`Adresat:`, „Urząd/Wójt/Burmistrz/Prezydent…”), tytuł (linia `WNIOSEK …`) i flagi (słowa „firma”, „siedziba”, NIP, REGON, „pełnomocnik”) da się znaleźć wyrażeniami regularnymi pewniej niż modelem 4B.
3. **Rozrzut między przebiegami** mimo `temperature=0`: warto dodać `seed` albo głosowanie z 2–3 przebiegów, jeśli zmieści się w czasie.
4. **OCR jest najsłabszym ogniwem:** gubi znaczniki `____`. Do rozważenia: model wizyjny dla obrazów.
5. Do sprawdzenia: większy model (np. ok. 14 mld parametrów w Q4 mieści się w 24 GB), czy poprawi metadane i stabilność, i ile kosztuje czasowo.

## Przebieg: formularz 1 z XLSX (po bloku B3)

Pola: 4/4 zgodne ze wzorcem, wszystkie TEXT_FIELD jak we wzorcu (z PDF jedno wychodziło NUMBER). Organ „Wójt Gminy Elbląg” znaleziony, bo w arkuszu kolumny nie są sklejone. Do poprawy w prompcie bloku C:
- **Klauzula RODO jako zgoda.** Model streścił klauzulę informacyjną do `consents`, i to w formie z płcią („zostałem”). Według Standardów klauzuli nie wstawia się na formularz. Zgoda ma być krótka, neutralna płciowo i z linkiem do klauzuli (wzorzec: „Wyrażam zgodę na przetwarzanie moich danych osobowych zgodnie z klauzulą informacyjną”). Prompt: klauzula RODO to nie zgoda, pomiń ją. Standardową zgodę dodaje builder (blok D).
- **Etykiety dopisane i rozwlekłe.** „Ulica i numer budynku”, choć blankiet ma tylko „przy ulicy”; „Miejscowość, w której znajduje się budynek” zamiast „Miejscowość”. Prompt: etykieta ma być krótka i brać tylko słowa z blankietu.
- **Tytuł sekcji to tytuł formularza**, a powinien być tematyczny (wzorzec: strona „Informacje o budynku”, sekcja „Lokalizacja budynku”).
- **`authority_kind` pominięte** (domyślnie URZAD), a Wójt to ORGAN. Rozwiązuje blok J2 (reguły).
