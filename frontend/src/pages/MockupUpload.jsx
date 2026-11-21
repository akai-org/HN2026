import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
  FilePlus2,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  ScanText,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@/components/mockup/mockup.css";
import MockupHeader from "@/components/mockup/MockupHeader.jsx";
import HelpDialog from "@/components/mockup/HelpDialog.jsx";
import Dropzone from "@/components/mockup/Dropzone.jsx";
import FileRow from "@/components/mockup/FileRow.jsx";
import {
  MAX_FILE_SIZE_MB,
  STEPS,
  convertFile,
  fileTypeOf,
  formatSize,
  plural,
  rejectionReason,
} from "@/components/mockup/files.js";

// Testowa strona na bazie makiety Figma „Konwerter formularzy — makiety dla urzędników”,
// odświeżona wizualnie i podpięta do POST /api/forms/convert (jeden plik na żądanie).

const theme = {
  "--blue": "#0b4ea2",
  "--blue-hover": "#093f86",
  "--blue-soft": "#eaf1fb",
  "--blue-ring": "#c9dbf3",
  fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif",
};

const HOW_IT_WORKS = [
  { icon: FilePlus2, title: "Dodaj pliki", text: "Skan, zdjęcie albo dokument. Nawet kilka naraz." },
  {
    icon: ScanText,
    title: "Rozpoznamy pola",
    text: "Nazwy, formaty, listy dozwolonych wartości i zależności między polami.",
  },
  {
    icon: ListChecks,
    title: "Sprawdzisz i zatwierdzisz",
    text: "Zanim formularz trafi do eUsługi, przejrzysz i poprawisz wynik.",
  },
];

const PASTE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg" };
const timestamp = () => Date.now();

const plikow = (count) => plural(count, ["plik", "pliki", "plików"]);
// Po przeczeniu dopełniacz: „nie dodano 1 pliku”, „nie dodano 3 plików”.
const plikowDopelniacz = (count) => (count === 1 ? "pliku" : "plików");

export default function MockupUpload() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [runIds, setRunIds] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [serviceWarning, setServiceWarning] = useState("");

  const itemsRef = useRef(items);
  const nextIdRef = useRef(1);
  const pasteCountRef = useRef(1);
  const abortRef = useRef(null);
  const isRunning = runIds !== null;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (incoming.length === 0) return;

    const known = itemsRef.current.map((item) => item.file);
    const accepted = [];
    const refused = [];
    for (const file of incoming) {
      const reason = rejectionReason(file, [...known, ...accepted]);
      if (reason) refused.push({ name: file.name, reason });
      else accepted.push(file);
    }

    setRejected(refused);
    if (accepted.length > 0) {
      const newItems = accepted.map((file) => ({
        id: nextIdRef.current++,
        file,
        previewUrl: fileTypeOf(file).isImage ? URL.createObjectURL(file) : null,
        status: "ready",
        error: "",
        result: null,
        startedAt: 0,
      }));
      setItems((current) => [...current, ...newItems]);
    }

    const parts = [];
    if (accepted.length) parts.push(`Dodano ${accepted.length} ${plikow(accepted.length)}.`);
    if (refused.length) parts.push(`Nie dodano ${refused.length} ${plikowDopelniacz(refused.length)}.`);
    setAnnouncement(parts.join(" "));
  }, []);

  // Przeciąganie plików nad całym oknem: nakładka i upuszczenie w dowolnym miejscu.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    function onDragEnter(event) {
      if (!hasFiles(event)) return;
      depth += 1;
      setIsDragging(true);
    }
    function onDragLeave(event) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    }
    function onDragOver(event) {
      if (hasFiles(event)) event.preventDefault();
    }
    function onDrop(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setIsDragging(false);
      addFiles(event.dataTransfer.files);
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  // Wklejanie obrazów ze schowka (Ctrl+V / ⌘+V).
  useEffect(() => {
    function onPaste(event) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(
        files.map((file) => {
          const extension = PASTE_EXTENSIONS[file.type];
          if (!extension) return file;
          const name = `zrzut-ze-schowka-${pasteCountRef.current++}.${extension}`;
          return new File([file], name, { type: file.type, lastModified: Date.now() });
        }),
      );
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // Czy usługa rozpoznawania odpowiada (backend + model językowy).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((health) => {
        if (health.llm !== "ok") {
          setServiceWarning("Model językowy jest chwilowo niedostępny. Pliki możesz dodać już teraz.");
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") setServiceWarning("Nie udało się połączyć z serwerem.");
      });
    return () => controller.abort();
  }, []);

  // Licznik sekund przy pliku w trakcie rozpoznawania.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // Ostrzeżenie przed zamknięciem karty w trakcie rozpoznawania.
  useEffect(() => {
    if (!isRunning) return;
    const onBeforeUnload = (event) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isRunning]);

  // Sprzątanie: przerwij żądanie i zwolnij podglądy obrazów przy wyjściu ze strony.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

  function updateItem(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function recognize(ids) {
    if (isRunning || ids.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunIds(ids);
    setItems((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, status: "queued", error: "" } : item)),
    );

    let done = 0;
    let failed = 0;
    for (const id of ids) {
      if (controller.signal.aborted) break;
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item) continue; // usunięty w trakcie
      updateItem(id, { status: "processing", startedAt: timestamp() });
      try {
        const result = await convertFile(item.file, controller.signal);
        updateItem(id, { status: "done", result });
        done += 1;
      } catch (error) {
        if (error.name === "AbortError") {
          updateItem(id, { status: "ready" });
          break;
        }
        updateItem(id, { status: "error", error: error.message });
        failed += 1;
      }
    }

    setItems((current) => current.map((item) => (item.status === "queued" ? { ...item, status: "ready" } : item)));
    setRunIds(null);
    abortRef.current = null;
    setAnnouncement(
      controller.signal.aborted
        ? "Rozpoznawanie przerwane."
        : `Zakończono rozpoznawanie. Rozpoznano: ${done}. Błędy: ${failed}.`,
    );
  }

  function cancelRecognition() {
    abortRef.current?.abort();
  }

  function removeItem(target) {
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setItems((current) => current.filter((item) => item.id !== target.id));
    setAnnouncement(`Usunięto plik ${target.file.name}.`);
  }

  function clearAll() {
    items.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setRejected([]);
    setAnnouncement("Usunięto wszystkie pliki.");
  }

  function review(item) {
    navigate("/identify", { state: { fileName: item.file.name, convertedForm: item.result } });
  }

  const readyItems = items.filter((item) => item.status === "ready");
  const failedItems = items.filter((item) => item.status === "error");
  const doneItems = items.filter((item) => item.status === "done");
  const toRecognize = [...readyItems, ...failedItems];
  const readySize = readyItems.reduce((sum, item) => sum + item.file.size, 0);
  const runProgress = isRunning
    ? items.filter((item) => runIds.includes(item.id) && (item.status === "done" || item.status === "error")).length
    : 0;
  const activeStep = isRunning || doneItems.length > 0 ? 2 : 1;
  const hasItems = items.length > 0;

  const primaryButton =
    "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue) active:translate-y-px disabled:pointer-events-none sm:flex-none";
  const primaryEnabled = "bg-(--blue) text-white shadow-sm shadow-blue-900/20 hover:bg-(--blue-hover)";
  const arrow = <ArrowRight aria-hidden="true" size={18} />;
  const failedNote =
    failedItems.length > 0 ? (
      <span className="text-red-700">
        {" "}
        · {failedItems.length} z błędem
      </span>
    ) : null;

  let summary = null;
  let primaryAction = null;
  if (isRunning) {
    summary = (
      <>
        <span className="font-semibold text-slate-900">
          Rozpoznawanie {Math.min(runProgress + 1, runIds.length)} z {runIds.length}
        </span>
        <span className="hidden sm:inline"> · zwykle trwa to do minuty na plik</span>
      </>
    );
    primaryAction = (
      <>
        <button
          type="button"
          onClick={cancelRecognition}
          className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-(--blue)"
        >
          Anuluj
        </button>
        <button type="button" disabled className={`${primaryButton} bg-(--blue) text-white opacity-90`}>
          <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" /> Rozpoznawanie…
        </button>
      </>
    );
  } else if (readyItems.length > 0) {
    // Nowe pliki czekają: rozpoznaj je razem z tymi, które wcześniej się nie udały.
    summary = (
      <>
        <span className="font-semibold text-slate-900">
          {readyItems.length} {plikow(readyItems.length)} · {formatSize(readySize)}
        </span>
        {doneItems.length > 0 ? ` · rozpoznano już ${doneItems.length}` : " · gotowe do rozpoznania"}
        {failedNote}
      </>
    );
    primaryAction = (
      <button
        type="button"
        onClick={() => recognize(toRecognize.map((item) => item.id))}
        className={`${primaryButton} ${primaryEnabled}`}
      >
        {doneItems.length > 0 ? `Rozpoznaj pozostałe (${toRecognize.length})` : "Rozpoznaj formularze"}
        {arrow}
      </button>
    );
  } else if (doneItems.length > 0) {
    // Część mogła się nie udać; ponowić można przy pliku, a dalej da się iść z tym, co jest.
    summary = (
      <>
        <span className="font-semibold text-emerald-700">
          Rozpoznano {doneItems.length} {plural(doneItems.length, ["formularz", "formularze", "formularzy"])}
        </span>
        {failedNote}
      </>
    );
    primaryAction = (
      <button type="button" onClick={() => review(doneItems[0])} className={`${primaryButton} ${primaryEnabled}`}>
        Przejdź do sprawdzania {arrow}
      </button>
    );
  } else if (failedItems.length > 0) {
    summary = (
      <span className="font-semibold text-red-700">
        Nie udało się rozpoznać {failedItems.length} {plikowDopelniacz(failedItems.length)}
      </span>
    );
    primaryAction = (
      <button
        type="button"
        onClick={() => recognize(failedItems.map((item) => item.id))}
        className={`${primaryButton} ${primaryEnabled}`}
      >
        <RotateCcw aria-hidden="true" size={17} /> Spróbuj ponownie
      </button>
    );
  }

  return (
    <div style={theme} className="relative isolate flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-120 bg-[radial-gradient(70%_100%_at_50%_0%,#dce8f8_0%,rgba(248,250,252,0)_100%)]"
      />

      <MockupHeader activeStep={activeStep} onHelp={() => setHelpOpen(true)} />

      <main
        className={`mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 ${
          hasItems ? "pt-8 pb-10 sm:pt-10" : "pt-10 pb-16 sm:pt-12"
        }`}
      >
        {/* Po dodaniu plików nagłówek się zwija, żeby lista była od razu widoczna. */}
        <div className="text-center motion-safe:animate-[mk-rise-in_400ms_ease-out]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-(--blue-ring) bg-white/80 px-3 py-1 text-xs font-semibold text-(--blue) shadow-xs">
            <Sparkles aria-hidden="true" size={14} />
            Krok {activeStep} z {STEPS.length} · {STEPS[activeStep - 1]}
          </span>
          <h1
            className={`font-bold tracking-tight text-balance text-slate-900 transition-all ${
              hasItems ? "mt-3 text-2xl sm:text-3xl" : "mt-5 text-3xl sm:text-5xl sm:leading-[1.1]"
            }`}
          >
            Zamień papierowy formularz na eFormularz
          </h1>
          {!hasItems && (
            <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-slate-600 sm:text-lg">
              Dodaj skan, zdjęcie lub plik z formularzem. Rozpoznamy jego pola, a Ty sprawdzisz wynik, zanim
              trafi do eUsługi.
            </p>
          )}
        </div>

        {serviceWarning && (
          <div
            role="status"
            className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p>
              <span className="font-semibold">Rozpoznawanie może teraz nie działać.</span> {serviceWarning}
            </p>
          </div>
        )}

        <div className={`motion-safe:animate-[mk-rise-in_500ms_ease-out] ${hasItems ? "mt-6" : "mt-8 sm:mt-10"}`}>
          <Dropzone compact={hasItems} isDragging={isDragging} onFiles={addFiles} />
        </div>

        {rejected.length > 0 && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm motion-safe:animate-[mk-pop-in_200ms_ease-out]"
          >
            <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-900">
                Nie dodano {rejected.length} {plikowDopelniacz(rejected.length)}
              </p>
              <ul className="mt-1 space-y-0.5 text-red-800">
                {rejected.map(({ name, reason }) => (
                  <li key={name + reason} className="wrap-break-word">
                    <span className="font-semibold">{name}</span>: {reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-red-800/80">
                Obsługujemy PDF, Word, Excel, ODS, JPG i PNG do {MAX_FILE_SIZE_MB} MB.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRejected([])}
              aria-label="Zamknij komunikat"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-red-700 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-600"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        )}

        {hasItems ? (
          <section
            aria-labelledby="mk-files-title"
            className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <h2 id="mk-files-title" className="flex items-center gap-2 font-semibold">
                Twoje pliki
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {items.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={clearAll}
                disabled={isRunning}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-(--blue) disabled:pointer-events-none disabled:opacity-40"
              >
                Usuń wszystkie
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  now={now}
                  onRemove={removeItem}
                  onRetry={(target) => recognize([target.id])}
                  onReview={review}
                />
              ))}
            </ul>
            {failedItems.length > 0 && !isRunning && (
              <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm text-slate-600 sm:px-5">
                Pliki z błędem możesz spróbować rozpoznać jeszcze raz albo usunąć z listy.
              </p>
            )}
          </section>
        ) : (
          <section aria-labelledby="mk-how-title" className="mt-14">
            <h2
              id="mk-how-title"
              className="text-center text-xs font-bold tracking-[0.14em] text-slate-500 uppercase"
            >
              Jak to działa
            </h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-3">
              {HOW_IT_WORKS.map(({ icon: Icon, title, text }, index) => (
                <li
                  key={title}
                  className="relative rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xs backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-(--blue-soft) text-(--blue)">
                      <Icon aria-hidden="true" size={22} strokeWidth={1.9} />
                    </span>
                    <span aria-hidden="true" className="text-3xl font-bold text-slate-200">
                      {index + 1}
                    </span>
                  </div>
                  <p className="mt-4 font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      {/* Pasek akcji pojawia się dopiero, gdy jest co zrobić; przy pustej liście akcją jest strefa plików. */}
      {primaryAction && (
        <div className="sticky bottom-0 z-20 border-t border-slate-200/80 bg-white/85 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md motion-safe:animate-[mk-rise-in_250ms_ease-out]">
          <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
            <p className="text-sm text-slate-600">{summary}</p>
            <div className="flex items-center gap-2">{primaryAction}</div>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-(--blue)/10 p-6 backdrop-blur-[2px] motion-safe:animate-[mk-fade-in_150ms_ease-out]">
          <div className="rounded-3xl border-2 border-dashed border-(--blue) bg-white/95 px-10 py-8 text-center shadow-2xl motion-safe:animate-[mk-pop-in_180ms_ease-out]">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-(--blue) text-white shadow-lg shadow-blue-900/30 motion-safe:animate-bounce">
              <ArrowUp aria-hidden="true" size={26} strokeWidth={2.5} />
            </span>
            <p className="mt-4 text-lg font-semibold text-slate-900">Upuść pliki, aby je dodać</p>
            <p className="mt-1 text-sm text-slate-500">
              PDF, Word, Excel, ODS, JPG, PNG · do {MAX_FILE_SIZE_MB} MB
            </p>
          </div>
        </div>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
