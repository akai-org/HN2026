// Dodawanie plików, grupowanie w formularze i rozpoznawanie.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
  BookOpenCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FileJson,
  LoaderCircle,
  Merge,
  RotateCcw,
  Split,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Dropzone from "../components/Dropzone.jsx";
import GroupCard from "../components/GroupCard.jsx";
import PreviewDialog from "../components/PreviewDialog.jsx";
import Popover from "../components/Popover.jsx";
import { Button, IconButton, Modal } from "../components/primitives.jsx";
import { buttonClass } from "../components/buttonClass.js";
import { EXAMPLE } from "../lib/constants.js";
import { MAX_FILE_SIZE_MB } from "../lib/files.js";
import { collectDropEntries, readDropEntries } from "../lib/folders.js";
import { groupProblem, groupStats, isEditable } from "../lib/grouping.js";
import { FORMS, count } from "../lib/text.js";
import { useConverter } from "../state/ConverterProvider.jsx";


const FILTERS = [
  { id: "all", label: "Wszystkie", match: () => true },
  { id: "todo", label: "Do rozpoznania", match: (group) => group.status === "ready" || group.status === "queued" || group.status === "processing" },
  { id: "done", label: "Rozpoznane", match: (group) => group.status === "done" },
  { id: "error", label: "Z błędem", match: (group) => group.status === "error" },
];


const PASTE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg" };

function useWindowFileDrop(onEntries, enabled) {
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let depth = 0;
    const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (event) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setIsDragging(true);
    };
    const onDragLeave = (event) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    };
    const onDragOver = (event) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setIsDragging(false);
      const collected = collectDropEntries(event.dataTransfer);
      readDropEntries(collected).then(({ entries, truncated }) => onEntries(entries, { truncated }));
    };
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
  }, [onEntries, enabled]);
  return isDragging;
}

function usePasteFiles(onEntries) {
  const counter = useRef(1);
  useEffect(() => {
    const onPaste = (event) => {
      if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      onEntries(
        files.map((file) => {
          const extension = PASTE_EXTENSIONS[file.type];
          if (!extension) return { file, folder: "" };
          const name = `zrzut-ze-schowka-${counter.current++}.${extension}`;
          return { file: new File([file], name, { type: file.type, lastModified: Date.now() }), folder: "" };
        }),
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onEntries]);
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Przykład do testu i wczytanie gotowego JSON-a: jedna linijka pod strefą plików. */
function ExampleRow({ onExample, onImport, busy }) {
  const importRef = useRef(null);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <Button variant="soft" size="sm" disabled={busy} onClick={onExample}>
        <BookOpenCheck aria-hidden="true" size={16} /> Otwórz przykład<span className="sr-only">: {EXAMPLE.label}</span>
      </Button>
      <Button variant="quiet" size="sm" disabled={busy} onClick={() => importRef.current?.click()}>
        <FileJson aria-hidden="true" size={16} /> Wczytaj JSON
      </Button>
      <input
        ref={importRef}
        type="file"
        multiple
        accept=".json,.pdf,.jpg,.jpeg,.png,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onImport(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { state, actions, running, health } = useConverter();
  const { groups, items, rejected } = state;
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("all");
  const [expandedOverrides, setExpandedOverrides] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const now = useNow(running);
  const listRef = useRef(null);

  const onEntries = useCallback((entries, options) => actions.addFiles(entries, options), [actions]);
  const isDragging = useWindowFileDrop(onEntries, true);
  usePasteFiles(onEntries);

  const stats = groupStats(groups);
  const hasGroups = groups.length > 0;
  const problems = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, groupProblem(group, items)])), [groups, items]);
  const toRecognize = groups.filter((group) => isEditable(group) && !problems[group.id]);
  const editableCount = groups.filter(isEditable).length;
  const doneGroups = groups.filter((group) => group.status === "done");
  const activeFilter = FILTERS.find((candidate) => candidate.id === filter) ?? FILTERS[0];
  const visibleGroups = groups.filter(activeFilter.match);
  const manyGroups = groups.length > 12;
  const isExpanded = (group) => expandedOverrides[group.id] ?? (!manyGroups && group.itemIds.length <= 6);
  const allExpanded = groups.every(isExpanded);

  const openReview = (group) => navigate(`/konwerter/sprawdz/${group.id}`);

  useEffect(() => {
    document.title = "Dodaj formularz · Konwerter formularzy";
  }, []);

  async function runLoader(task) {
    setLoadError("");
    setLoading(true);
    try {
      const id = await task();
      navigate(`/konwerter/sprawdz/${id}`);
    } catch (error) {
      setLoadError(error?.message ?? "Nie udało się wczytać formularza.");
    } finally {
      setLoading(false);
    }
  }

  function toggleAll() {
    const next = {};
    for (const group of groups) next[group.id] = !allExpanded;
    setExpandedOverrides(next);
  }

  let summary = null;
  let primary = null;
  if (running) {
    const finished = stats.done + stats.error;
    summary = (
      <>
        <span className="font-semibold text-slate-900">
          {stats.processing + stats.queued > 0 ? `Rozpoznawanie · pozostało: ${stats.processing + stats.queued}` : "Rozpoznawanie · kończymy…"}
        </span>
        <span className="hidden sm:inline"> · gotowe {finished} · zwykle trwa to do minuty na formularz</span>
      </>
    );
    primary = (
      <>
        <Button variant="quiet" onClick={actions.cancelAll}>
          Anuluj wszystkie
        </Button>
        <Button variant="primary" disabled className="opacity-90">
          <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" /> Rozpoznawanie…
        </Button>
      </>
    );
  } else if (toRecognize.length > 0) {
    summary = (
      <>
        <span className="font-semibold text-slate-900">{count(toRecognize.length, FORMS.form)} do rozpoznania</span>
        {stats.done > 0 && ` · rozpoznano już ${stats.done}`}
        {stats.error > 0 && <span className="text-red-700"> · {stats.error} z błędem</span>}
      </>
    );
    primary = (
      <Button variant="primary" onClick={() => actions.recognize(toRecognize.map((group) => group.id))}>
        {stats.done > 0 ? `Rozpoznaj pozostałe (${toRecognize.length})` : `Rozpoznaj ${count(toRecognize.length, FORMS.form)}`}
        <ArrowRight aria-hidden="true" size={18} />
      </Button>
    );
  } else if (doneGroups.length > 0) {
    summary = (
      <span className="font-semibold text-emerald-800">
        Gotowe: {count(doneGroups.length, FORMS.form)}
        {stats.approved > 0 && ` · zatwierdzone ${stats.approved}`}
      </span>
    );
    const next = doneGroups.find((group) => !group.approved) ?? doneGroups[0];
    primary = (
      <Button variant="primary" onClick={() => openReview(next)}>
        Przejdź do sprawdzania <ArrowRight aria-hidden="true" size={18} />
      </Button>
    );
  } else if (stats.error > 0) {
    summary = <span className="font-semibold text-red-700">Nie udało się rozpoznać: {count(stats.error, FORMS.form)}</span>;
    primary = (
      <Button variant="primary" onClick={() => actions.recognize(groups.filter((group) => group.status === "error").map((group) => group.id))}>
        <RotateCcw aria-hidden="true" size={17} /> Spróbuj ponownie
      </Button>
    );
  }

  return (
    <>
      <div className={`mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 ${hasGroups ? "pt-8 pb-10" : "pt-10 pb-16 sm:pt-12"}`}>
        <h1
          className={`text-center font-bold tracking-tight text-balance text-slate-900 motion-safe:animate-[kv-rise-in_400ms_ease-out] ${
            hasGroups ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl sm:leading-[1.1]"
          }`}
        >
          Zamień papierowy formularz na eFormularz
        </h1>

        {health !== "ok" && health !== "unknown" && (
          <div role="status" className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <p>{health === "offline" ? "Serwer nie odpowiada, rozpoznawanie może nie działać." : "Model językowy jest chwilowo niedostępny."}</p>
          </div>
        )}

        <div className={`motion-safe:animate-[kv-rise-in_500ms_ease-out] ${hasGroups ? "mt-6" : "mt-8 sm:mt-10"}`}>
          <Dropzone compact={hasGroups} isDragging={isDragging} onEntries={onEntries} />
        </div>

        {rejected.length > 0 && (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm motion-safe:animate-[kv-pop-in_200ms_ease-out]">
            <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-red-700" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-900">Nie dodano {rejected.length === 1 ? "1 pliku" : `${rejected.length} plików`}</p>
              <ul className="mt-1 space-y-0.5 text-red-900">
                {rejected.map(({ name, reason }) => (
                  <li key={name + reason} className="wrap-break-word">
                    <span className="font-semibold">{name}</span>: {reason}
                  </li>
                ))}
              </ul>
            </div>
            <IconButton label="Zamknij komunikat" icon={X} variant="danger" onClick={actions.dismissRejected} />
          </div>
        )}

        {loadError && (
          <p role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            {loadError}
          </p>
        )}

        {hasGroups ? (
          <section ref={listRef} aria-labelledby="kv-groups-title" className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="kv-groups-title" className="text-xl font-bold text-slate-900">
                Formularze <span className="text-slate-500">({groups.length})</span>
              </h2>
              <div className="flex items-center gap-1">
                <IconButton
                  label={allExpanded ? "Zwiń wszystkie formularze" : "Rozwiń wszystkie formularze"}
                  icon={allExpanded ? ChevronsDownUp : ChevronsUpDown}
                  onClick={toggleAll}
                />
                <Popover
                  label="Więcej działań na liście"
                  button={<Ellipsis aria-hidden="true" size={18} />}
                  buttonClassName="flex size-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
                  width="w-64"
                >
                  {(close) => (
                    <div className="-m-2 flex flex-col">
                      <Button
                        variant="quiet"
                        size="sm"
                        className="justify-start"
                        disabled={running || editableCount < 2}
                        onClick={() => {
                          actions.mergeAll();
                          close();
                        }}
                      >
                        <Merge aria-hidden="true" size={16} /> Połącz wszystkie w jeden
                      </Button>
                      <Button
                        variant="quiet"
                        size="sm"
                        className="justify-start"
                        disabled={running || !groups.some((group) => isEditable(group) && group.itemIds.length > 1)}
                        onClick={() => {
                          actions.splitAll();
                          close();
                        }}
                      >
                        <Split aria-hidden="true" size={16} /> Każdy plik osobno
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="justify-start"
                        onClick={() => {
                          setConfirmClear(true);
                          close();
                        }}
                      >
                        <Trash2 aria-hidden="true" size={16} /> Wyczyść listę
                      </Button>
                    </div>
                  )}
                </Popover>
              </div>
            </div>

            {groups.length >= 4 && (
              <div role="group" aria-label="Pokaż formularze" className="mt-4 flex flex-wrap gap-2">
                {FILTERS.map((candidate) => {
                  const total = groups.filter(candidate.match).length;
                  const active = candidate.id === filter;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(candidate.id)}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition ${
                        active ? "border-(--blue) bg-(--blue) text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                      }`}
                    >
                      {candidate.label}
                      <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-slate-100"}`}>{total}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <ul className="mt-4 space-y-3">
              {visibleGroups.map((group) => {
                const index = groups.indexOf(group);
                const previous = groups[index - 1];
                return (
                  <li key={group.id}>
                    <GroupCard
                      group={group}
                      index={index}
                      items={group.itemIds.map((id) => items[id]).filter(Boolean)}
                      problem={problems[group.id]}
                      now={now}
                      expanded={isExpanded(group)}
                      onToggle={() => setExpandedOverrides((current) => ({ ...current, [group.id]: !isExpanded(group) }))}
                      canMergePrevious={Boolean(previous && isEditable(previous) && isEditable(group))}
                      actions={actions}
                      onPreview={setPreview}
                      onReview={openReview}
                    />
                  </li>
                );
              })}
              {visibleGroups.length === 0 && (
                <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                  Brak formularzy w tym widoku.
                </li>
              )}
            </ul>
          </section>
        ) : (
          <>
            <ExampleRow
              busy={loading}
              onExample={() => runLoader(() => actions.loadExample())}
              onImport={(files) => runLoader(() => actions.importFiles(files))}
            />
          </>
        )}
      </div>

      {primary && (
        <div className="sticky bottom-0 z-20 border-t border-slate-200/80 bg-white/90 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md motion-safe:animate-[kv-rise-in_250ms_ease-out]">
          <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
            <p className="text-sm text-slate-700">{summary}</p>
            <div className="flex items-center gap-2">{primary}</div>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-(--blue)/10 p-6 backdrop-blur-[2px] motion-safe:animate-[kv-fade-in_150ms_ease-out]">
          <div className="rounded-3xl border-2 border-dashed border-(--blue) bg-white/95 px-10 py-8 text-center shadow-2xl motion-safe:animate-[kv-pop-in_180ms_ease-out]">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-(--blue) text-white shadow-lg shadow-blue-900/30 motion-safe:animate-bounce">
              <ArrowUp aria-hidden="true" size={26} strokeWidth={2.5} />
            </span>
            <p className="mt-4 text-lg font-semibold text-slate-900">Upuść pliki albo foldery, aby je dodać</p>
            <p className="mt-1 text-sm text-slate-600">Każdy folder stanie się jednym formularzem · do {MAX_FILE_SIZE_MB} MB na plik</p>
          </div>
        </div>
      )}

      <PreviewDialog item={preview} onClose={() => setPreview(null)} />

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        size="sm"
        title="Wyczyścić listę?"
        description="Usuniemy wszystkie pliki i wyniki rozpoznawania z tej karty. Tego nie da się cofnąć."
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmClear(false)}>
              Zostaw
            </Button>
            <button
              type="button"
              className={buttonClass({ variant: "primary", className: "bg-red-700 hover:bg-red-800" })}
              onClick={() => {
                actions.clearAll();
                setExpandedOverrides({});
                setConfirmClear(false);
              }}
            >
              <Trash2 aria-hidden="true" size={17} /> Wyczyść listę
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {count(groups.length, FORMS.form)}, {count(Object.keys(items).length, FORMS.file)}.
        </p>
      </Modal>
    </>
  );
}
