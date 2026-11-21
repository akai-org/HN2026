import { useRef } from "react";
import { ArrowUp, Camera, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { ACCEPT, FORMAT_CHIPS, MAX_FILE_SIZE_MB } from "./files.js";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Kbd({ children }) {
  return (
    <kbd className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-[inherit] text-[11px] font-semibold text-slate-600 shadow-[inset_0_-1px_0_var(--color-slate-300)]">
      {children}
    </kbd>
  );
}

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

const primaryButton =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-(--blue) px-5 font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:bg-(--blue-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue) active:translate-y-px";
const secondaryButton =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue) active:translate-y-px";

export default function Dropzone({ compact, isDragging, onFiles }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function openPicker() {
    fileInputRef.current?.click();
  }

  // Klik w dowolne miejsce strefy otwiera wybór plików; przyciski obsługują się same.
  function handleAreaClick(event) {
    if (event.target.closest("button, a, input")) return;
    openPicker();
  }

  function handleInput(event) {
    onFiles(event.target.files);
    event.target.value = "";
  }

  const inputs = (
    <>
      <input ref={fileInputRef} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={handleInput} />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={handleInput}
      />
    </>
  );

  if (compact) {
    return (
      <div
        onClick={handleAreaClick}
        className={`group flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors sm:flex-nowrap sm:px-5 ${
          isDragging
            ? "border-solid border-(--blue) bg-(--blue-soft)"
            : "border-slate-300 bg-white/70 hover:border-(--blue)/50 hover:bg-white"
        }`}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--blue-soft) text-(--blue) transition-transform group-hover:-translate-y-0.5">
          <ArrowUp aria-hidden="true" size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Dodaj kolejne pliki</p>
          <p className="text-sm text-slate-500">
            Przeciągnij je tutaj albo wybierz z dysku
            <span className="hidden sm:inline">
              {" "}· wklej: <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd> + <Kbd>V</Kbd>
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => cameraInputRef.current?.click()} className={`${secondaryButton} h-10 px-3 sm:hidden`}>
            <Camera aria-hidden="true" size={18} /> Zdjęcie
          </button>
          <button type="button" onClick={openPicker} className={`${secondaryButton} h-10 px-4`}>
            <Plus aria-hidden="true" size={18} /> Dodaj pliki
          </button>
        </div>
        {inputs}
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={handleAreaClick}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center shadow-sm transition-all duration-200 sm:px-10 sm:py-12 ${
          isDragging
            ? "border-solid border-(--blue) bg-(--blue-soft) ring-8 ring-(--blue-soft)"
            : "border-slate-300 bg-white hover:border-(--blue)/50 hover:shadow-md"
        }`}
      >
        <Illustration isDragging={isDragging} />

        <h2 className="mt-7 text-xl font-semibold text-slate-900 sm:text-2xl">
          {isDragging ? "Upuść pliki tutaj" : "Przeciągnij pliki tutaj"}
        </h2>
        <p className="mt-1.5 text-slate-500">albo</p>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={openPicker} className={primaryButton}>
            <FolderOpen aria-hidden="true" size={19} /> Wybierz z dysku
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} className={`${secondaryButton} sm:hidden`}>
            <Camera aria-hidden="true" size={19} /> Zrób zdjęcie
          </button>
        </div>

        <ul aria-label="Obsługiwane formaty" className="mt-7 flex flex-wrap justify-center gap-2">
          {FORMAT_CHIPS.map(({ label, icon: Icon, tone }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pr-3 pl-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              <span className={`flex size-5 items-center justify-center rounded-full ${tone}`}>
                <Icon aria-hidden="true" size={12} strokeWidth={2.25} />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <p className="mt-3 text-sm text-slate-500">
          Każdy plik do {MAX_FILE_SIZE_MB} MB · możesz dodać kilka naraz
          <span className="hidden sm:inline">
            {" "}· wklej obraz: <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd> + <Kbd>V</Kbd>
          </span>
        </p>
        {inputs}
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
        <ShieldCheck aria-hidden="true" size={16} className="shrink-0 text-emerald-600" />
        Pliki służą tylko do rozpoznania formularza. Nie zapisujemy ich.
      </p>
    </div>
  );
}
