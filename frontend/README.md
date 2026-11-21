# Frontend: konwerter formularzy

Interfejs dla urzędnika: dodaje papierowy formularz (skan, zdjęcie, PDF, Word, arkusz), backend rozpoznaje pola, a urzędnik sprawdza wynik obok oryginału i pobiera plik JSON do importu w eUsługach.

Adres: **`/konwerter`** (stara makieta `/makieta` przekierowuje tutaj). Strony `/`, `/digitalize` i `/verify` zostały bez zmian.

## Uruchomienie

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173/konwerter, proxy /api → http://127.0.0.1:3000
npm test         # testy logiki (vitest)
npm run lint     # oxlint
npm run build    # build do ../src/hacknation_2026/static (serwuje go FastAPI)
```

Bez działającego backendu da się obejrzeć wszystko na przykładzie: na pierwszym ekranie kliknij „Otwórz przykład”. To PDF wniosku o stwierdzenie nadpłaty podatku i jego wzorcowy JSON z `dane_zadania` (kopie w `public/przyklady/`, pobierane dopiero po kliknięciu). Do testu rozpoznawania przez backend dodaj ten sam PDF: `dane_zadania/blankiety/5. Wniosek o stwierdzenie nadpłaty podatku/Wniosek o stwierdzenie nadpłaty podatku.PDF`.

## Jak to działa

### 1. Dodawanie plików i grupowanie (`/konwerter`)

- Pliki dodaje się przyciskiem, przeciągnięciem na dowolne miejsce strony, wklejeniem obrazu (Ctrl + V) albo **całym folderem** („Dodaj folder” lub przeciągnięcie folderu).
- Jeden formularz = grupa plików (strony jednego wniosku). Pliki z jednego folderu od razu trafiają do jednej grupy, luźne pliki są osobnymi formularzami.
- Grupy można łączyć („Połącz z poprzednim”, „Połącz wszystkie w jeden”), dzielić („Rozdziel tutaj”, „Każdy plik osobno”) i zmieniać kolejność stron strzałkami. Przy wielu plikach są filtry (do rozpoznania, rozpoznane, z błędem) i zwijanie grup.
- Podgląd każdego pliku (zdjęcie albo PDF) w oknie, miniatury zdjęć i pierwszej strony PDF-a.
- Walidacja jak w backendzie: format, rozmiar (`VITE_MAX_FILE_SIZE_MB`, domyślnie 10 jak `MAX_FILE_SIZE_MB`), długość i znaki nazwy, duplikaty.
- Rozpoznawanie idzie kolejką, po jednym formularzu (anulowanie pojedynczo albo wszystkich). Grupa kilku plików jest łączona w przeglądarce w jeden PDF (pdf-lib), bo `POST /api/forms/convert` przyjmuje jeden plik.

### 2. Sprawdzanie z podglądem na żywo (`/konwerter/sprawdz/:id`)

Trzy kolumny jak w makiecie z Figmy: **Oryginał**, **Formularz** i **JSON**. Kolumny można włączać w dowolnym zestawie, przestawiać (przeciąganie albo strzałki w nagłówku) i rozciągać (uchwyt między kolumnami, także strzałkami z klawiatury). Układ zapamiętuje się w przeglądarce. Na wąskim ekranie kolumny przełącza się zakładkami.

- **Oryginał**: PDF przez pdf.js (strony, powiększenie, warstwa tekstu dla czytników ekranu) albo zdjęcie (powiększenie, obrót).
- **Formularz**: podgląd eUsługi rysowany wprost z JSON-a: strony z `flow`, siatka 3 kolumn z `x/y/cols`, sekcje (`repeatingSectionGrid`), słowniki (Kraje, TERYT), dane z rejestrów (`EXTERNAL_SYSTEM`), zgody. **Warunki `states` (JSONata) działają naprawdę**: wybierz „Osoby prawnej…” albo zmień kraj, a pola pokażą się lub znikną. Objaśnienia mówią, skąd pole bierze wartość i kiedy się pokazuje.
- **JSON**: edytor CodeMirror (składnia, zwijanie, wyszukiwanie, polskie komunikaty o błędach) albo uproszczona **Struktura** (drzewo strona → sekcja → pole).
- **Połączenie na żywo**: kliknięcie pola w podglądzie podświetla jego fragment w JSON-ie i opisuje go zwykłym językiem. Kursor w JSON-ie zaznacza pole w podglądzie. Edycja w podglądzie (etykieta, „Obowiązkowe”, kolejność, usunięcie) od razu przepisuje JSON, a edycja JSON-a od razu zmienia podgląd. Przy błędzie składni podgląd zostaje na ostatniej poprawnej wersji. Działa cofnij/ponów.
- **Do sprawdzenia przed zatwierdzeniem**: ostrzeżenia z backendu (`warnings`) i reguły COI liczone w przeglądarce (unikalne `techName`, etykiety, opcje lub słownik, poprawność warunków, dozwolone walidatory i źródła danych, zgoda, strona końcowa). Przy każdej uwadze jest „Pokaż pole”.
- **Zatwierdź formularz** pobiera plik `.json` gotowy do importu.

## Kontrakt API

```
POST /api/forms/convert   multipart, pole "file" → { form: FormDefinition, warnings: string[] }
GET  /api/health          → { status: "ok", llm: "ok" | "unavailable" }
błędy                     → { code, message } (AppError)
```

Jeśli backend zacznie zwracać PDF oryginału (np. po konwersji z Worda), frontend sam go pokaże: wystarczy pole `pdf` / `pdf_base64` (base64) albo `pdf_url` w odpowiedzi. Bez nich podgląd korzysta z pliku wybranego w przeglądarce.

## Dostępność (WCAG 2.1 AA)

Link „Przejdź do treści”, punkty orientacyjne i nagłówki, widoczny fokus (granat + żółta poświata), cała obsługa z klawiatury (drzewo ARIA, uchwyty `role="separator"`, zakładki, okna `<dialog>`), komunikaty o postępie w `aria-live`, statusy nie tylko kolorem, cele min. 36 px, `prefers-reduced-motion`. Menu „Dostępność”: większy tekst, wysoki kontrast, mniej animacji, podkreślone linki. Automatyczny test axe-core (WCAG 2.1 A/AA) nie zgłasza naruszeń na obu ekranach.

## Struktura

```
src/features/konwerter/
  KonwerterLayout.jsx        rama: nagłówek z etapami, pomoc, dostępność, aria-live
  ReviewRoute.jsx            leniwe ładowanie ekranu sprawdzania (pdf.js i CodeMirror w osobnych plikach)
  pages/UploadPage.jsx       krok 1–2: pliki, grupy, kolejka
  pages/ReviewPage.jsx       krok 3: trzy kolumny i zatwierdzanie
  state/                     reducer (czysty) + ConverterProvider (kolejka, API, adresy blob:)
  lib/                       logika bez Reacta: formModel, conditions (JSONata), jsonPositions,
                             checks (reguły COI), grouping, files, folders, pdfMerge, api, doc (historia)
  lib/__tests__/             testy vitest na wzorcowych JSON-ach COI (form1.json tylko do testów)
  components/                wspólne klocki UI, podgląd PDF/zdjęć, karty formularzy
  review/                    kolumny, podgląd eUsługi, edytor JSON, drzewo, opis pola
public/przyklady/            przykład do testu: PDF i wzorcowy JSON formularza 5 z dane_zadania
```

Biblioteki (wszystkie MIT, Apache-2.0 lub BSD, bez zewnętrznych API): pdfjs-dist, pdf-lib, CodeMirror 6, jsonc-parser, jsonata, DOMPurify, lucide-react.
