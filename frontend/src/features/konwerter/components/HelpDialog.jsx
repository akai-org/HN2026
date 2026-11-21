import { Accessibility, Braces, Camera, ChevronDown, FileStack, FolderTree, Keyboard, ShieldCheck } from "lucide-react";
import { FORMAT_SUMMARY, MAX_FILE_SIZE_MB } from "../lib/files.js";
import { Kbd, Modal } from "./primitives.jsx";

const JSON_TERMS = [
  ["title", "nazwa formularza widoczna dla mieszkańca"],
  ["tabs", "strony formularza; ostatnia (FINISH) to podgląd przed wysłaniem"],
  ["questions", "pola na stronie; x, y, cols i rows to miejsce w siatce 3 kolumn"],
  ["field.type", "rodzaj pola, np. TEXT_FIELD (tekst), RADIO (jednokrotny wybór), SECTION (sekcja)"],
  ["techName", "nazwa techniczna pola, unikalna; po niej działają warunki"],
  ["repeatingSectionGrid", "pola wewnątrz sekcji"],
  ["validation", "reguły, np. REQUIRED (pole obowiązkowe), PESEL, EMAIL"],
  ["states", "warunki w języku JSONata, np. pokaż pole, gdy wybrano „Polska”"],
  ["defaultValueType: EXTERNAL_SYSTEM", "wartość z rejestru, np. PESEL.name albo MLPZ.email"],
  ["dictionaryName", "lista wartości ze słownika, np. Kraje albo TERYT"],
];

const TOPICS = [
  {
    icon: FileStack,
    title: "Jakie pliki mogę dodać?",
    body: (
      <>
        <p>{FORMAT_SUMMARY}. Każdy plik może mieć do {MAX_FILE_SIZE_MB} MB.</p>
        <p>Możesz dodać wiele plików naraz, cały folder albo wkleić zrzut ekranu skrótem Ctrl + V.</p>
      </>
    ),
  },
  {
    icon: FolderTree,
    title: "Jak połączyć strony w jeden formularz?",
    body: (
      <>
        <p>
          Każdy plik trafia na listę jako osobny formularz. Pliki z jednego folderu łączymy od razu w jeden formularz,
          bo zwykle są to kolejne strony tego samego wniosku.
        </p>
        <p>
          Przyciskiem „Połącz z poprzednim” dołączysz strony do formularza powyżej, a „Rozdziel tutaj” zacznie nowy
          formularz od wybranego pliku. Strzałkami przy pliku zmienisz kolejność stron. PDF-y i zdjęcia jednego
          formularza łączymy w jeden plik PDF przed wysłaniem.
        </p>
      </>
    ),
  },
  {
    icon: Camera,
    title: "Jak zrobić dobre zdjęcie formularza?",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Połóż kartkę płasko, najlepiej na ciemnym tle.</li>
        <li>Zadbaj o równe światło, bez cieni i odblasków.</li>
        <li>Cała strona powinna mieścić się w kadrze.</li>
        <li>Każdą stronę sfotografuj osobno i dodaj w kolejności.</li>
      </ul>
    ),
  },
  {
    icon: Braces,
    title: "Co oznacza JSON po prawej stronie?",
    body: (
      <>
        <p>
          JSON to plik, który importuje się do systemu eUsług. Podgląd formularza powstaje na żywo z tego pliku: gdy
          zmienisz etykietę w podglądzie, zmieni się JSON, a gdy poprawisz JSON, zmieni się podgląd.
        </p>
        <dl className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {JSON_TERMS.map(([term, meaning]) => (
            <div key={term} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_1fr]">
              <dt className="font-mono text-[13px] font-semibold text-slate-900">{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Co dzieje się z moimi plikami?",
    body: <p>Pliki służą tylko do rozpoznania formularza i nie są zapisywane. Wynik zostaje w tej karcie przeglądarki, dopóki jej nie zamkniesz.</p>,
  },
  {
    icon: Keyboard,
    title: "Skróty klawiszowe",
    body: (
      <ul className="space-y-1.5">
        <li><Kbd>Tab</Kbd> przechodzi do kolejnego elementu, <Kbd>Shift</Kbd> + <Kbd>Tab</Kbd> do poprzedniego.</li>
        <li><Kbd>Ctrl</Kbd> + <Kbd>V</Kbd> wkleja obraz ze schowka jako nowy plik.</li>
        <li>W edytorze JSON: <Kbd>Ctrl</Kbd> + <Kbd>F</Kbd> szuka, <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> cofa zmianę. Klawisz <Kbd>Tab</Kbd> wychodzi z edytora.</li>
        <li>W drzewie struktury: strzałki przesuwają zaznaczenie, <Kbd>→</Kbd> rozwija, <Kbd>←</Kbd> zwija.</li>
        <li>Szerokość kolumn zmienisz strzałkami po zaznaczeniu uchwytu między kolumnami.</li>
      </ul>
    ),
  },
  {
    icon: Accessibility,
    title: "Deklaracja dostępności",
    body: (
      <>
        <p>
          Strona jest projektowana zgodnie z WCAG 2.1 na poziomie AA: działa z klawiatury i czytnikiem ekranu, ma
          widoczny fokus, wystarczający kontrast i komunikaty o postępie. W menu „Dostępność” powiększysz tekst,
          włączysz wysoki kontrast i ograniczysz animacje.
        </p>
        <p>
          Znane ograniczenia: podgląd skanu jest obrazem, więc jego treść czytnik odczyta tylko wtedy, gdy PDF zawiera
          warstwę tekstową. Edytor JSON to narzędzie dla osób technicznych; te same zmiany zrobisz w podglądzie formularza.
        </p>
      </>
    ),
  },
];

export default function HelpDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Pomoc" side="right" size="md">
      <div className="space-y-3">
        {TOPICS.map(({ icon: Icon, title, body }, index) => (
          <details
            key={title}
            open={index === 0}
            className="group rounded-2xl border border-slate-200 bg-white transition-colors open:border-(--blue-ring) open:bg-(--blue-soft)/40"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-(--blue) ring-1 ring-slate-200">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="flex-1">{title}</span>
              <ChevronDown aria-hidden="true" size={18} className="text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-slate-700 sm:pl-16">{body}</div>
          </details>
        ))}
      </div>
    </Modal>
  );
}
