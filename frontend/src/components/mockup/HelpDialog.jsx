import { useEffect, useRef } from "react";
import { Camera, ChevronDown, FileStack, ListChecks, ShieldCheck, X } from "lucide-react";
import { MAX_FILE_SIZE_MB } from "./files.js";

const TOPICS = [
  {
    icon: FileStack,
    title: "Jakie pliki mogę dodać?",
    body: (
      <>
        <p>
          PDF, dokumenty Word (DOC, DOCX), arkusze Excel (XLSX) i OpenDocument (ODS) oraz zdjęcia
          lub skany w formacie JPG albo PNG.
        </p>
        <p>Każdy plik może mieć do {MAX_FILE_SIZE_MB} MB. Możesz dodać kilka plików naraz.</p>
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
        <li>Każdą stronę sfotografuj osobno.</li>
      </ul>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Co dzieje się z moimi plikami?",
    body: <p>Pliki służą tylko do rozpoznania formularza. Nie zapisujemy ich.</p>,
  },
  {
    icon: ListChecks,
    title: "Co będzie dalej?",
    body: (
      <p>
        Rozpoznamy pola formularza: ich nazwy, formaty, listy dozwolonych wartości i zależności między
        polami. Potem przejrzysz wynik i zatwierdzisz go, zanim formularz trafi do eUsługi.
      </p>
    ),
  },
];

export default function HelpDialog({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="mk-help-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mk-help m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm open:motion-safe:animate-[mk-slide-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="mk-help-title" className="text-lg font-semibold">
            Pomoc
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij pomoc"
            className="flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-(--blue)"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {TOPICS.map(({ icon: Icon, title, body }, index) => (
            <details
              key={title}
              open={index === 0}
              className="group rounded-2xl border border-slate-200 bg-white transition-colors open:border-(--blue-ring) open:bg-(--blue-soft)/40"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 font-semibold focus-visible:outline-2 focus-visible:outline-(--blue) [&::-webkit-details-marker]:hidden">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-(--blue) ring-1 ring-slate-200">
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span className="flex-1">{title}</span>
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  className="text-slate-400 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="space-y-2 px-4 pb-4 pl-16 text-sm leading-relaxed text-slate-600">{body}</div>
            </details>
          ))}
        </div>

        <p className="border-t border-slate-200 px-6 py-4 text-sm text-slate-500">
          Wskazówka: obraz ze schowka (np. zrzut ekranu) wkleisz skrótem{" "}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-[inherit] text-xs font-semibold text-slate-600">
            Ctrl
          </kbd>{" "}
          +{" "}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-[inherit] text-xs font-semibold text-slate-600">
            V
          </kbd>
          .
        </p>
      </div>
    </dialog>
  );
}
