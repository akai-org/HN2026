// Strefa dodawania plików (jak na /makieta) z dodatkowym przyciskiem „Dodaj folder”.
// Upuszczanie obsługuje nakładka na całe okno (UploadPage), więc tu są tylko przyciski i opis.
import { useRef } from "react";
import { ArrowUp, Camera, FolderOpen, FolderPlus, Plus, ShieldCheck } from "lucide-react";
import { ACCEPT, MAX_FILE_SIZE_MB } from "../lib/files.js";
import { entriesFromFileList } from "../lib/folders.js";
import { buttonClass } from "./buttonClass.js";
import { Kbd } from "./primitives.jsx";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const CHIPS = [
  { label: "PDF", tone: "bg-red-700" },
  { label: "Word", tone: "bg-blue-700" },
  { label: "Excel", tone: "bg-emerald-700" },
  { label: "ODS", tone: "bg-teal-700" },
  { label: "JPG", tone: "bg-violet-700" },
  { label: "PNG", tone: "bg-violet-700" },
];

function Illustration({ isDragging }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-28 w-36">
      <span
        className={`absolute top-3 left-5 h-22 w-17 rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition-transform duration-300 group-hover:-translate-x-1.5 group-hover:-rotate-12 ${
          isDragging ? "-translate-x-2 -rotate-12" : "-rotate-6"
        }`}
      />
      <span
        className={`absolute top-1 right-5 flex h-22 w-17 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-md transition-transform duration-300 group-hover:translate-x-1.5 group-hover:rotate-9 ${
          isDragging ? "translate-x-2 rotate-9" : "rotate-3"
        }`}
      >
        <i className="h-1.5 w-7 rounded-full bg-(--blue-ring)" />
        <i className="h-1.5 w-10 rounded-full bg-slate-200" />
        <i className="h-1.5 w-8 rounded-full bg-slate-200" />
        <i className="h-1.5 w-10 rounded-full bg-slate-200" />
        <i className="h-1.5 w-5 rounded-full bg-slate-200" />
      </span>
      <span
        className={`absolute bottom-0 left-1/2 flex size-12 -translate-x-1/2 items-center justify-center rounded-full bg-(--blue) text-white shadow-lg ring-4 shadow-blue-900/30 ring-white transition-transform duration-300 group-hover:-translate-y-1.5 ${
          isDragging ? "-translate-y-2 scale-110" : ""
        }`}
      >
        <ArrowUp size={22} strokeWidth={2.5} />
      </span>
    </div>
  );
}

export default function Dropzone({ compact, isDragging, onEntries, disabled }) {
  const filesRef = useRef(null);
  const folderRef = useRef(null);
  const cameraRef = useRef(null);

  function handleInput(event) {
    onEntries(entriesFromFileList(event.target.files));
    event.target.value = "";
  }

  // Klik w puste miejsce strefy otwiera wybór plików; przyciski obsługują się same.
  function handleAreaClick(event) {
    if (disabled || event.target.closest("button, a, input, kbd")) return;
    filesRef.current?.click();
  }

  const inputs = (
    <>
      <input ref={filesRef} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleInput} />
      <input
        ref={folderRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInput}
      />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleInput} />
    </>
  );

  const pasteHint = (
    <span className="hidden sm:inline">
      {" "}
      · wklej obraz: <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd> + <Kbd>V</Kbd>
    </span>
  );

  if (compact) {
    return (
      <section
        aria-label="Dodaj kolejne pliki"
        onClick={handleAreaClick}
        className={`group flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors sm:flex-nowrap sm:px-5 ${
          isDragging ? "border-solid border-(--blue) bg-(--blue-soft)" : "border-slate-300 bg-white/70 hover:border-(--blue)/50 hover:bg-white"
        }`}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--blue-soft) text-(--blue) transition-transform group-hover:-translate-y-0.5">
          <ArrowUp aria-hidden="true" size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Dodaj kolejne pliki</p>
          <p className="text-sm text-slate-600">
            Przeciągnij je tutaj, wybierz z dysku albo dodaj cały folder
            {pasteHint}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()} className={buttonClass({ size: "sm", className: "sm:hidden" })}>
            <Camera aria-hidden="true" size={17} /> Zdjęcie
          </button>
          <button type="button" disabled={disabled} onClick={() => folderRef.current?.click()} className={buttonClass({ size: "sm" })}>
            <FolderPlus aria-hidden="true" size={17} /> Dodaj folder
          </button>
          <button type="button" disabled={disabled} onClick={() => filesRef.current?.click()} className={buttonClass({ size: "sm" })}>
            <Plus aria-hidden="true" size={17} /> Dodaj pliki
          </button>
        </div>
        {inputs}
      </section>
    );
  }

  return (
    <section aria-labelledby="kv-drop-title">
      <div
        onClick={handleAreaClick}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center shadow-sm transition-all duration-200 sm:px-10 sm:py-12 ${
          isDragging ? "border-solid border-(--blue) bg-(--blue-soft) ring-8 ring-(--blue-soft)" : "border-slate-300 bg-white hover:border-(--blue)/50 hover:shadow-md"
        }`}
      >
        <Illustration isDragging={isDragging} />
        <h2 id="kv-drop-title" className="mt-7 text-xl font-bold text-slate-900 sm:text-2xl">
          {isDragging ? "Upuść pliki tutaj" : "Przeciągnij pliki albo folder tutaj"}
        </h2>
        <p className="mt-1.5 text-slate-600">albo</p>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button type="button" disabled={disabled} onClick={() => filesRef.current?.click()} className={buttonClass({ variant: "primary", size: "lg" })}>
            <FolderOpen aria-hidden="true" size={19} /> Wybierz pliki
          </button>
          <button type="button" disabled={disabled} onClick={() => folderRef.current?.click()} className={buttonClass({ size: "lg" })}>
            <FolderPlus aria-hidden="true" size={19} /> Dodaj folder
          </button>
          <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()} className={buttonClass({ size: "lg", className: "sm:hidden" })}>
            <Camera aria-hidden="true" size={19} /> Zrób zdjęcie
          </button>
        </div>

        <ul aria-label="Obsługiwane formaty" className="mt-7 flex flex-wrap justify-center gap-2">
          {CHIPS.map(({ label, tone }) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pr-3 pl-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${tone}`} />
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Każdy plik do {MAX_FILE_SIZE_MB} MB · pliki z jednego folderu połączymy w jeden formularz
          {pasteHint}
        </p>
        {inputs}
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600">
        <ShieldCheck aria-hidden="true" size={16} className="shrink-0 text-emerald-700" />
        Pliki służą tylko do rozpoznania formularza. Nie zapisujemy ich.
      </p>
    </section>
  );
}
