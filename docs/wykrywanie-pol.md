# Wykrywanie pól i kratek w blankietach – projekt (2026-11-21)

Etap projektowy: prototypy i pomiary są w `scripts/`, w `src/` nic nie zmieniono. Stan „po” kodu w `src/` (wdrożenie koordynatora: `extract/fields.py`, zmiany w `pdf.py`, `image.py`, `word.py`) zmierzyłem jako osobnego kandydata.

## 1. Problem

Model widzi tylko tekst. Pole jest w tekście, gdy ekstraktor wstawi znacznik (`____` dla miejsca do wpisania, `[ ]` dla kratki) **we właściwym miejscu**, czyli obok etykiety, której dotyczy. Na papierze miejsce do wpisania wygląda różnie:

| Postać na blankiecie | Przykłady | Skąd ją wziąć |
|---|---|---|
| kropki / podkreślniki jako znaki | 1, 3, 4, 5, 6, 9 | tekst (PDF, Word, arkusz); obraz: rząd małych plamek |
| podkreślenie (odcinek) | 2 (stopki), 8 | grafika wektorowa / linia w obrazie / obramowanie dolne komórki |
| pusta ramka | 2, 5 | wektor / obraz / obramowana komórka |
| komórka tabeli z etykietą u góry i pustym miejscem pod nią | 7, 8 (≈40 pól) | geometria komórki + położenie tekstu w niej |
| rząd kratek na litery i cyfry (NIP, PESEL, data DD-MM-RRRR, rachunek) | 2, 5, 8 | sąsiadujące małe komórki = **jedno** pole |
| kratka wyboru: glif fontu (❑ □ Wingdings) | 7, 8, 9 | znak w tekście; obraz: mały kwadratowy pierścień |
| kratka wyboru narysowana | 2, 8 | wektor / obraz / kształt w DOCX |

Formy 2 i 8 w DOCX/DOC to konwersje z PDF: cała strona to setki kształtów z bezwzględną pozycją (8 DOCX: 2571 kształtów, 651 ramek tekstowych). W takim pliku pole nie ma żadnego śladu w tekście.

## 2. Miara

### Wzorzec
PDF każdego formularza, odczytany prototypowym detektorem wektorowym `fields_proto.pdf_vector` (warstwa tekstu + linie, prostokąty i krzywe z pdfplumber). Wynik jest w `scripts/wzorzec_pol.json` (po zmianie detektora odświeża go `field_benchmark.py ref`). Pozostałe pliki formularza mają tę samą treść, więc wszystkie formaty porównuję z tym samym wzorcem.

Kontrola wzorca:
- **Przegląd wizualny** nakładek (zielone pola, czerwone kratki) na strony PDF: 1/1, 2/1–2, 3, 4, 5, 6/1–2, 7/1, 8/1–6, 9/2–4. Zauważone usterki: w formularzu 8 brak pola „51. SUMA” (etykieta w 3 liniach plus „zł”); ramka „Miejsce na pieczęć Urzędu” (7) i pola „Adnotacja organu” (8) liczą się jako pola, bo są puste. Odsiać je ma model, nie detektor.
- **Niezależny detektor rastrowy** (OpenCV na obrazach PNG/JPG, w ogóle nie czyta PDF) zgadza się z wzorcem w 360 z 361 pól i 81 z 81 kratek (miara geometryczna niżej). Dwie różne metody dają prawie ten sam wynik, więc wzorcowi można ufać. Uwaga: prototypy stroiłem na tych samych 9 formularzach (patrz Ryzyka).

### Miara tekstowa (główna, dla każdego formatu)
Mierzy to, co dostaje model, czyli `ExtractedDocument.as_text()`:
1. Tekst dzielę na słowa i znaczniki: F = `____`, C = `[ ]`, `[x]` albo `☐`. Kilka F pod rząd bez słowa między nimi liczy się jako jedno pole, bo kilka pustych linii to jedno pole typu TEXTAREA.
2. Kontekst znacznika to 4 słowa przed nim i 4 po nim.
3. Znaczniki wzorca i kandydata tego samego rodzaju łączę w pary 1:1, zaczynając od najlepiej pasujących. Para wymaga ≥ 3 wspólnych słów kontekstu (na 8).
4. Recall = pary / pola wzorca, precyzja = pary / znaczniki kandydata. Sumy liczę mikro, po wszystkich formularzach.

Miara nie zależy od kolejności czytania, więc ramki tekstowe Worda czy dwie kolumny jej nie psują. Liczy za to **położenie**: znacznik bez właściwej etykiety obok się nie liczy. Samo liczenie `____` (jak w `ocr_benchmark.py`) tego nie widzi. Przykład: obecny kod daje dla formularza 8 PNG 76 znaczników, ale tylko 35 z 64 stoi przy właściwej etykiecie.

### Miara geometryczna (dla detektorów zwracających prostokąty)
Para to pole tego samego rodzaju na tej samej stronie: pola nachodzą na siebie poziomo w ≥ 50% krótszego z nich, kratki mają środki odległe o ≤ 6 pt. Obrazy 1654 px szerokości to rendery 200 dpi, więc da się je przeliczyć na punkty PDF. Formularza 5 (skan 130 dpi z marginesami) nie da się tak dopasować i jest tylko w mierze tekstowej.

Uruchamianie (z katalogu głównego):
```bash
uv run python scripts/field_benchmark.py ref                # odbuduj wzorzec z PDF
uv run python scripts/field_benchmark.py src                # ekstraktory z src/ (wszystkie formaty)
PYTHONPATH=<katalog z src z HEAD> uv run python scripts/field_benchmark.py src   # stan z gita
uv run python scripts/field_benchmark.py proto-image png,jpg
uv run python scripts/field_benchmark.py geo                # sam detektor obrazu, ok. 2 s
uv run python scripts/field_benchmark.py proto-docx
uv run python scripts/field_benchmark.py proto-pdf-raster
```

## 3. Wyniki

Wzorzec w mierze tekstowej: 274 pola i 81 kratek. Formatów DOCX i XLSX brakuje dla części formularzy, więc ich sumy są mniejsze.

### 3.1 Podsumowanie (pola F: recall / precyzja; kratki C: recall / precyzja)

| Format | HEAD (przed) | src teraz (koordynator) | Najlepszy prototyp |
|---|---|---|---|
| PDF | F 66% / 99%, C 67% / 96% | F 77% / 82%, C 100% / 100% | wektor (`pdf_vector`) = wzorzec; wariant tekst + raster `pdf_raster`: F 93% / 96%, C 100% / 100% |
| PNG | F 7% / 62%, C 0% | F 87% / 86%, C 90% / 95% | **F 98% / 99%, C 100% / 100%** (`image_raster` + Tesseract) |
| JPG | F 8% / 67%, C 0% | F 86% / 85%, C 90% / 95% | **F 98% / 99%, C 100% / 100%** |
| DOCX | F 56% / 99%, C 66% / 100% | F 67% / 98%, C 66% / 100% | **F 97% / 98%, C 99% / 100%** (kształty → raster dla 2 i 8, reszta przez obecny `word.py`) |
| DOC | F 56% / 99%, C 20% / 94% | F 56% / 99%, C 20% / 94% (bez zmian) | brak prototypu (patrz 4.4) |
| XLSX | F 98% / 65%, C 71% / 100% | bez zmian | wariant reguły obramowań był gorszy (F 90% / 62%), odrzucony |
| ODS | F 98% / 66%, C 67% / 100% | bez zmian | – |

Detektor geometryczny na obrazach, sam (bez OCR), na formularzach 1–4 i 6–9: **pola 360/361 (R 100%, P 99%), kratki 81/81 (R 100%, P 100%)**. PNG i JPG dają to samo. Na skanie formularza 5 (oceniony wzrokowo i miarą tekstową) wykrywa wszystkie 17 linii z kropek i rząd 26 kratek rachunku; jedyny fałszywy alarm to kreska nad przypisem.

### 3.2 Szczegóły słabych miejsc (F trafione/wzorzec, miara tekstowa)

| Formularz / format | HEAD | src teraz | Prototyp | Przyczyna |
|---|---|---|---|---|
| 2 PDF | 0/22 | 19/22 (P 73%), C 4/4 | wzorzec 22/22, raster 21/22 | ramki i rzędy kratek; w src fałszywe pola na grubych liniach sekcji |
| 2 DOCX | 0/22, C 0/4 | 0/22, C 0/4 | **21/22, C 4/4** | strona z kształtów (konwersja z PDF) |
| 2 PNG | 1/22 | 20/22, C 3/4 (P 43%) | 20/22, C 4/4 | – |
| 7 PDF | 10/19 | 14/19 (P 74%) | wzorzec 19/19, raster 18/19 | komórki z etykietą u góry („Imię i nazwisko”, „Ulica:”) |
| 7 PNG | 1/19 | 14/19, C 5/5 | **19/19, C 5/5** | jw. |
| 8 PDF | 2/64, C 0/22 | 8/64 (P 20%), C 22/22 | wzorzec 64, raster 48/64 | ok. 40 komórek z etykietą, rzędy kratek, szare tła |
| 8 PNG | 0/64 | 35/64 (P 57%), C 22/22 | **61/64, C 22/22** | jw. |
| 8 DOCX | 2/64, C 0/22 | 2/64, C 0/22 | **58/64, C 21/22** | strona z kształtów |
| 8 XLSX/ODS | 59/64 (P 32%), C 0/22 | bez zmian | – | `____` na każdej krawędzi ramki, kratki nie rozpoznane |
| 6 DOC | 14/42 | 14/42 | – | tabulatory z kropkami są we właściwościach akapitu (PAPX) |
| 9 DOC | C 12/50 | C 12/50 | – | kratki to punktory list (J5) |
| 2, 8 DOC | 0/22, 3/64 | bez zmian | – | strona z kształtów OfficeArt w binarnym DOC |

Czas: detekcja na obrazie jest pomijalna przy OCR (formularz 9: 16 stron, ok. 7 s razem z Tesseractem, tyle samo co HEAD). Detektor wektorowy PDF: wszystkie 9 formularzy w ok. 4 s, z uruchomieniem Pythona.

## 4. Rekomendowana architektura

**Jeden słownik geometryczny, wiele źródeł.** Każdy format zamienia się na to samo: słowa z położeniem i elementy `{kind: field|checkbox, bbox, via}`. Potem wspólny kod składa z tego linie tekstu ze znacznikami. Sedno to jeden klasyfikator komórek (`classify_cells` w `fields_proto.py`), który działa tak samo na komórkach z wektorów PDF, z obrazu i z kształtów DOCX:

- **komórki** to prostokąty zamknięte liniami, czyli spójne obszary tła, które nie dotykają krawędzi strony (`mask_cells`);
- komórka z inną komórką w środku to ramka, pomijana;
- rząd przylegających pustych małych komórek (≤ 30 × 36 pt, przerwa ≤ 22 pt, np. myślnik w dacie) to **jedno pole** „kratki”;
- pojedyncza mała pusta komórka (3–24 pt, prawie kwadrat) to **kratka wyboru**;
- pusta większa komórka bez szarego tła to **pole**;
- komórka z etykietą przy górnej krawędzi i ≥ 10 pt pustego miejsca pod nią to **pole za etykietą** („Ulica: ____”). Krótki dopisek w dolnej części (np. „zł”) i jasnoszary tekst-podpowiedź (DD-MM-RRRR) nie zajmują komórki;
- komórka z szarym tłem nie jest polem (nagłówki, części „wypełnia urząd” w formularzu 8).

Do tego dwa detektory spoza komórek: **linie z kropek** (rząd ≥ 5 plamek wielkości kropki, ≥ 20 pt długości) i **podkreślenia** (pozioma kreska ≤ 1,5 pt grubości, która nie jest krawędzią komórki, nie styka się z pionową linią, nie ma tekstu tuż nad sobą i nie leży w stopce strony).

### 4.1 PDF z warstwą tekstu: wektory, nie raster
- Słowa, ciągi kropek i podkreślników oraz glify kratek biorę ze znaków pdfplumber, z położeniem.
- Ciemne cienkie prostokąty (≤ 3,5 pt), linie i obrysy rysuję do maski 4 px/pt, a potem `mask_cells` → `classify_cells`. Jasne wypełnione prostokąty to tylko tło (do testu szarego tła).
- Uzasadnienie: geometria jest dokładna (nie trzeba progować pikseli), koszt mały, a szare podpowiedzi rozpoznaje się po kolorze znaku. Wariant „render strony + detektor obrazu” (tak działa teraz `src/pdf.py`) w moim wykonaniu dał F 93% / 96%, a w `src` 77% / 82%. Tracił głównie komórki z etykietą, które w rastrze trzeba łączyć z tekstem z innego źródła.
- Strona bez tekstu idzie ścieżką obrazu (bez zmian).

### 4.2 Obraz / skan: OpenCV + Tesseract
`fields_proto.image_raster`:
- binaryzacja adaptacyjna; linie przez otwarcie morfologiczne (poziome ≥ 12 pt, pionowe ≥ 7 pt);
- komórki to dziury w masce linii, jak w PDF;
- kratki-glify to dziury w tuszu o kształcie kwadratowego pierścienia. Testy: 4 wierzchołki, wypełnione narożniki (odrzuca D, O, 0), pierścień cienki, wolne miejsce obok;
- kropki to małe plamki łączone w poziome ciągi; pochylenie skanu do ok. 1° jest tolerowane;
- treść komórki to plamki tuszu ciemniejsze niż 160, więc szare podpowiedzi się nie liczą; szare tło to mediana komórki niższa od mediany strony.
- Słowa Tesseracta (`--psm 11`) leżące na wykrytych kropkach, kratkach i liniach są odrzucane (to „tekst” odczytany z kropek). Znaczniki wstawiane są po położeniu.
- Jednostki liczone od rozdzielczości: szerokość strony = A4, więc działa przy 130 i 200 dpi.
- **Model wizyjny niepotrzebny** do wykrywania: geometria daje ≈ 100% na tych danych. Można go rozważyć do odczytu etykiet na złych skanach. Nie mierzyłem.

### 4.3 DOCX: dwa tryby
- **Dokument płynący** (zwykły Word): obecny `word.py` (kropki w tekście, tabulatory z wypełnieniem kropkami, podkreślone spacje i tabulatory, FORMTEXT, listy z kratkami). Wynik: 168/169 pól, 50/50 kratek.
- **Strona z kształtów** (≥ 20 kotwic `wp:anchor`, typowe dla konwersji PDF→Word): `fields_proto.docx_shapes`.
  - Każdy akapit z kotwicami to jedna strona.
  - Pozycje kształtów (EMU), wypełnienia, obrysy i ścieżki `custGeom` są rysowane do obrazu. Ramka to jedna ścieżka z obrysem zewnętrznym i wewnętrznym, wypełniana parzyście-nieparzyście.
  - Tekst z ramek tekstowych rysowany jest jako plamki wielkości liter. Inaczej detektor brałby go za linie.
  - Na tym obrazie działa ten sam `image_raster`, a tekst z pozycjami pochodzi z ramek tekstowych.
  - Wynik: formularz 2: 21/22 pól i 4/4 kratki; formularz 8: 58/64 i 21/22 (wcześniej 0 i 2).

### 4.4 DOC (binarny)
Nie ma biblioteki z licencją permisywną, która czytałaby układ DOC, a LibreOffice jest odrzucone. Odczyt tekstu przez tabelę fragmentów (piece table) zostaje. Plan w kolejności zysku:
1. J5: kratki z list (formularz 9: C 12/50 → cel 50/50).
2. Tabulatory z wypełnieniem z PAPX (`sprmPChgTabs`), tak jak w DOCX (formularz 6: 14/42 → cel 42/42).
3. DOC zbudowany z kształtów (2, 8): bez wdrożenia, bo koszt to cały parser OfficeArt. Pipeline zwraca ostrzeżenie „mało wykrytych pól – prześlij PDF lub DOCX”, gdy w DOC są obiekty rysunkowe, a znaczników jest mniej niż np. 3.

### 4.5 XLSX / ODS
Recall jest dobry (98%), problemem jest precyzja (65%; w formularzu 8 tylko 32%) i kratki w formularzach 7 i 8. Sprawdziłem regułę „bok widoczny z komórki albo z sąsiada; pole = dolna krawędź albo ≥ 3 boki”. Wynik był gorszy (F 90% / 62%), więc reguła odpada. Fałszywe `____` stoją na marginesach ramek (wąskie kolumny z jedną krawędzią) na początku i końcu linii. Proponowana poprawka: pomijać pustą obramowaną komórkę na skraju linii, gdy kolumna jest wąska (< 2 znaków) i ma obramowanie tylko z jednej strony. Jeśli to nie wystarczy, arkusz też można narysować (szerokości kolumn, wysokości wierszy, scalenia, obramowania) i puścić przez `image_raster`, jak DOCX z kształtów. Tego nie mierzyłem.

### 4.6 Ocena wdrożenia koordynatora (`src/extract/fields.py` i spółka)
Mocne strony: obrazy z 7% na 87% pól i z 0% na 90% kratek; kratki PDF 100%; DOCX formularz 6 z 14 na 42. Słabe punkty i poprawki (każda zmierzona prototypem):
1. **Brak komórek z etykietą u góry**. To główna strata w 7 i 8: PNG 8 ma 35/64, prototyp 61/64. Dodać `mask_cells` + `classify_cells` (wnętrze komórki puste poniżej etykiety → pole po etykiecie).
2. **Rzędy kratek wyłącznie z konturów** – kratka o grubszej ściance albo z szarą literą (DD-MM-RRRR w 8) nie przechodzi. Komórki jako dziury w masce linii (jak w prototypie) i ignorowanie jasnego tuszu.
3. **Fałszywe pola na grubych liniach sekcji i stopkach** (2 PDF/PNG, precyzja 73–77%). Wymagać grubości ≤ 1,5 pt, braku pionowej kreski na końcu i pomijać dolne 15% strony.
4. **PDF przez render 150 dpi** zamiast wektorów: wektory dają dokładną geometrię i kolor znaków (podpowiedzi). Rekomendacja 4.1.
5. **Kratki-glify w PNG (formularz 9, 43/50)**: małe □ (≈ 4 pt) są poniżej progu 1,6 mm. Prototyp bierze od 3 pt i odsiewa litery testem narożników.
6. **Kolumny**: nadal sklejane („(imię i nazwisko) Wójt Gminy Elbląg”) w PDF i w obrazach. Zadanie J1 bez zmian: przerwa > 40 pt między tokenami tekstu = osobne segmenty, z wyjątkiem par etykieta–znacznik.
7. **Licencja OpenCV**: patrz Ryzyka.

## 5. Kontrakt dla modelu

Zostaje tekst ze znacznikami: model dobrze rozumie `____` i `[ ]` (`docs/wybor-modelu.md`), a kontrakt `ExtractedDocument` się nie zmienia. Poprawki przy renderowaniu tekstu (każda tylko w `as_text`/`line_block`, bez nowych typów bloków):

| Znacznik | Znaczenie | Po co modelowi |
|---|---|---|
| `Etykieta ____` | pole w linii, za etykietą (także komórka z etykietą) | TEXT_FIELD |
| `____ (3 linie)` | kilka pustych linii lub wysoka pusta ramka pod sobą zamiast 3 osobnych `____` | TEXTAREA zamiast 3 pól |
| `____ [11 kratek]`, `____ [2-2-4 kratki]` | rząd kratek na znaki; liczba kratek w grupach | 11 → PESEL, 10 → NIP, 2-2-4 → DATEPICKER, 26 → numer rachunku |
| `[ ] opcja` | kratka wyboru | RADIO/CHECKBOX |
| `A ‖ B` | dwie kolumny w jednej linii (J1), gdy nie da się ich rozdzielić | nie skleja organu z etykietą |

Elementy z kroku detekcji mają już te informacje (`via`, liczba komórek w `comb{n}`, wysokość ramki), więc to tylko renderowanie. Wpływu na model **nie mierzyłem**: krok K7 robi pomiar `llm_probe.py` przed i po na formularzach 1, 5 i 8.

Kontraktu geometrycznego (bbox w `Block`) nie proponuję. Builder sam układa pola (`x/y/rows/cols`), więc model pozycji nie potrzebuje.

## 6. Plan wdrożenia (małe kroki)

Każdy krok mierzy `scripts/field_benchmark.py` (miara tekstowa, wzorzec `scripts/wzorzec_pol.json`). Progi „gotowe, gdy” są dla wszystkich 9 formularzy.

| Krok | Pliki | Gotowe, gdy |
|---|---|---|
| K1 Miara w repo | `scripts/field_benchmark.py`, `scripts/fields_proto.py`, `scripts/wzorzec_pol.json`; test `tests/extract_fields/test_benchmark.py` oznaczony jako wolny | `uv run python scripts/field_benchmark.py src` drukuje tabelę; test pilnuje progów z kroków K2–K6 dla formatów, których dotyczą |
| K2 Komórki w detektorze obrazu | `src/hacknation_2026/extract/fields.py` (przenieść `mask_cells`, `classify_cells`, kwadraty-dziury, kropki ze skosem, szare tło, jasny tusz), `tests/extract_fields/` | PNG i JPG: F R ≥ 97%, P ≥ 97%; C R = 100%, P ≥ 98%; geometria (`geo`) F ≥ 99%; formularz 8 PNG F ≥ 58/64 |
| K3 PDF z wektorów | `src/hacknation_2026/extract/pdf.py` (przenieść `_pdf_page`), `fields.py` (wspólny klasyfikator), testy | PDF: F ≥ 97% i C 100% względem wzorca; **dodatkowo** zgodność geometryczna z detektorem obrazu na PNG ≥ 98% (żeby nie mierzyć PDF samym sobą) |
| K4 DOCX ze strony z kształtów | `src/hacknation_2026/extract/word.py` (gałąź przy ≥ 20 `wp:anchor`, przenieść `docx_shapes`), testy | DOCX: formularz 2 F ≥ 20/22, C 4/4; formularz 8 F ≥ 55/64, C ≥ 21/22; pozostałe DOCX bez spadku (F 168/169, C 50/50) |
| K5 Arkusze: precyzja i kratki | `src/hacknation_2026/extract/sheet.py`, `tests/extract_sheet/` | XLSX i ODS: F P ≥ 90% przy R ≥ 95%; C R ≥ 95% (formularze 7, 8) |
| K6 DOC: listy i tabulatory | `src/hacknation_2026/extract/word.py` (część DOC; J5 + `sprmPChgTabs`), `tests/extract_word/` | formularz 9 DOC: C 50/50; formularz 6 DOC: F ≥ 40/42; dla DOC 2 i 8 ostrzeżenie w `ConvertResult.warnings` |
| K7 Podpowiedzi w tekście | `src/hacknation_2026/extract/_text.py`, ekstraktory (liczba kratek, linie), `src/hacknation_2026/ai/prompt.py` (opis znaczników) | `llm_probe.py` na 1, 5, 8 (PDF i PNG): typy pól zgodne ze wzorcem nie gorzej niż przed zmianą; w 8 PESEL/NIP/data rozpoznane z liczby kratek |
| K8 Kolumny (J1) | `src/hacknation_2026/extract/pdf.py`, `image.py` (wspólne składanie linii) | formularze 1 i 3: organ w osobnym segmencie; miara pól bez spadku |
| K9 Licencja OpenCV | `pyproject.toml`, `fields.py` | decyzja zespołu zapisana; jeśli „bez LGPL”, detektor na `numpy` + `scipy.ndimage` (BSD) z tymi samymi wynikami `geo` |

Kolejność: K1 → K2 → K3 (wspólny klasyfikator), równolegle K4, K5, K6. K7 po K2–K4, K8 w dowolnym momencie.

## 7. Ryzyka

- **Dopasowanie do 9 formularzy.** Progi (rozmiary kratek, 10 pt pustego miejsca pod etykietą, kropki ≥ 20 pt) stroiłem na tych samych danych, na których mierzę. Wyniki ≈ 100% to górna granica. Przed oddaniem warto sprawdzić 2–3 obce blankiety (np. z BIP) samym przeglądem nakładek.
- **Wzorzec z własnego detektora.** Dla PDF miara jest kołowa. Łagodzi to przegląd wizualny i zgodność z niezależnym detektorem rastrowym (360/361 i 81/81). Kilka spornych przypadków (pieczęć urzędu, „Adnotacja organu”) liczy się jako pola, a odsiać je ma model.
- **Skany.** Jedyny prawdziwy skan to formularz 5 (130 dpi, szum, lekki skos). Zdjęcia telefonem (perspektywa, cień, skos > 1°) nie są sprawdzone; potrzebne prostowanie (deskew) przed detekcją. Formularze wypełnione ręcznie: pismo w polu zrobi z pustej komórki komórkę z treścią.
- **Komórka z etykietą** daje fałszywe pola w szerokich komórkach z krótkim nagłówkiem i pustym miejscem (np. tabele informacyjne). Ograniczają to testy szarego tła i „ramka z komórkami w środku”, ale bez gwarancji.
- **Miara tekstowa** łączy kilka pustych linii w jedno pole i przy powtarzalnych sekcjach (formularz 9: trzy wnioski z tymi samymi polami) może sparować pole z bliźniaczym. Liczba pól się zgadza, sekcja niekoniecznie.
- **DOC z kształtami** (2, 8) zostaje słaby (0–5% pól); wymaga ostrzeżenia dla urzędnika.
- **Licencja OpenCV.** `opencv-python-headless` (dodany w `pyproject.toml`) ma licencję Apache 2.0, ale koło dla macOS zawiera biblioteki FFmpeg na LGPL (lista w `LICENSE-3RD-PARTY.txt` pakietu). W `.venv/.../cv2/.dylibs` są też `libx264`/`libx265` (GPL), choć mogą pochodzić z drugiego zainstalowanego pakietu, `opencv-contrib-python` od paddlex. Detektor używa tylko ~10 funkcji (progowanie, morfologia, składowe spójne, kontury), więc da się go przepisać na `numpy` + `scipy.ndimage` (BSD). Decyzja należy do zespołu (K9); trzeba też sprawdzić koło dla Linuksa używane w Dockerze.
- **Kolejność czytania** (kolumny, ramki Worda) nie wpływa na moją miarę, ale wpływa na model. Mierzy to dopiero K7/K8.

## Pliki

- `scripts/fields_proto.py`: prototypy (`pdf_vector`, `image_raster`, `docx_shapes`, `pdf_raster`, wspólne `mask_cells`/`classify_cells`/`assemble`, `overlay` do podglądu).
- `scripts/field_benchmark.py`: miara tekstowa i geometryczna, tabele.
- `scripts/wzorzec_pol.json`: wzorzec (tekst ze znacznikami i prostokąty pól z PDF).
