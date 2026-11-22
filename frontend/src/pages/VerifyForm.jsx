import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import FormPreview from "@/components/comparison/FormPreview";
import JsonPanel from "@/components/comparison/JsonPanel";
import OriginalPanel from "@/components/comparison/OriginalPanel";
import { ChevronLeft, Download, TriangleAlert } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { getFile } from "@/lib/fileStore";
import { downloadJson, indexForm, plural, replaceNode, resolveWarning } from "@/lib/formDefinition";
import { localStore, sessionStore } from "@/lib/storage";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "original", label: "Oryginał" },
  { key: "form", label: "Formularz" },
  { key: "json", label: "JSON" },
];
const ALL_VIEWS = { original: true, form: true, json: true };
const GRID_COLUMNS = ["", "", "lg:grid-cols-2", "lg:grid-cols-2 xl:grid-cols-3"]; // by number of open panels

const VIEWS_KEY = "uniform-comparison-views";
// The results with the official's edits, saved together with the history entry they belong to. The original
// files are not saved, see lib/fileStore.js.
const SESSION_KEY = "uniform-verify-session";

function savedViews() {
  const views = localStore.read(VIEWS_KEY, null);
  return views && VIEWS.some(({ key }) => views[key]) ? { ...ALL_VIEWS, ...views } : ALL_VIEWS;
}

/** A reload keeps the edits; a new navigation starts from the results it brings, or from the last session. */
function initialResults(location) {
  const saved = sessionStore.read(SESSION_KEY, null);
  const savedResults = Array.isArray(saved?.results) ? saved.results : [];
  if (saved?.entry === location.key) return savedResults;
  return location.state?.convertedForms?.length ? location.state.convertedForms : savedResults;
}

export default function VerifyForm() {
  const location = useLocation();
  // Each navigation here brings its own results, so it starts a fresh session.
  return <VerifySession key={location.key} location={location} />;
}

function VerifySession({ location }) {
  const [results, setResults] = useState(() => initialResults(location));
  const [current, setCurrent] = useState(0);
  const [views, setViews] = useState(savedViews);
  const result = results[current];

  useEffect(() => {
    // The router keeps the scroll position of the previous page.
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    sessionStore.write(SESSION_KEY, { entry: location.key, results });
  }, [location.key, results]);

  function toggleView(key) {
    const next = { ...views, [key]: !views[key] };
    if (!VIEWS.some((view) => next[view.key])) return; // keep at least one panel open
    setViews(next);
    localStore.write(VIEWS_KEY, next);
  }

  function updateForm(form) {
    setResults((all) =>
      all.map((entry, index) =>
        index === current ? { ...entry, convertedForm: { ...entry.convertedForm, form } } : entry,
      ),
    );
  }

  if (!result) {
    return (
      <div className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-background p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Brak formularza do sprawdzenia</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dodaj plik z formularzem, żeby porównać go z wersją cyfrową.
          </p>
          <Link to="/" className={buttonVariants({ className: "mt-4" })}>
            Dodaj formularz
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1800px]">
        <Comparison
          key={`${current}-${result.fileId ?? result.fileName}`}
          result={result}
          results={results}
          current={current}
          onCurrentChange={setCurrent}
          views={views}
          onToggleView={toggleView}
          backState={location.state}
          onUpdateForm={updateForm}
        />
      </div>
    </div>
  );
}

/** The original, the form preview and the JSON of one conversion result side by side, with a shared selection. */
function Comparison({
  result,
  results,
  current,
  onCurrentChange,
  views,
  onToggleView,
  backState,
  onUpdateForm,
}) {
  const { form, warnings, proposed_dictionaries: proposals } = result.convertedForm ?? {};
  const index = useMemo(() => indexForm(form), [form]);
  const resolvedWarnings = useMemo(
    () => (warnings ?? []).map((warning) => resolveWarning(warning, form)),
    [warnings, form],
  );
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const pageCount = form?.tabs?.length ?? 0;
  const panelCount = VIEWS.filter(({ key }) => views[key]).length;

  function select(id) {
    setSelectedId((currentId) => (currentId === id ? null : id));
    const tabIndex = index.byId.get(id)?.tabIndex;
    if (tabIndex !== undefined) setPage(tabIndex);
  }

  function showWarning({ tabIndex, id }) {
    if (tabIndex !== null) setPage(tabIndex);
    if (id) setSelectedId(id);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Link to="/digitalize" state={backState} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ChevronLeft />
          Wróć
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{form?.title || "Formularz bez tytułu"}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {result.fileName} · {pageCount} {plural(pageCount, "strona", "strony", "stron")} ·{" "}
            {index.fieldCount} {plural(index.fieldCount, "pole", "pola", "pól")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {results.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Plik</span>
              <select
                value={current}
                onChange={(event) => onCurrentChange(Number(event.target.value))}
                className="h-10 max-w-72 rounded-lg border border-foreground/25 bg-background px-3 py-2 text-sm font-medium shadow-sm focus-ring"
              >
                {results.map((entry, entryIndex) => (
                  <option key={entryIndex} value={entryIndex}>
                    Formularz {entry.formNumber ?? 1} · {entry.fileName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button onClick={() => downloadJson(form)}>
            <Download />
            Pobierz JSON
          </Button>
        </div>
      </div>

      {(resolvedWarnings.length > 0 || proposals?.length > 0) && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {resolvedWarnings.length > 0 && <Warnings warnings={resolvedWarnings} onShow={showWarning} />}
          {proposals?.length > 0 && <DictionaryProposals proposals={proposals} />}
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {VIEWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={views[key]}
              onClick={() => onToggleView(key)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold focus-ring transition-colors",
                views[key]
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/25 bg-background shadow-sm hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hidden max-w-72 text-right text-xs text-muted-foreground md:inline">
          Porównaj oryginał z wersją cyfrową. Kliknij pole na oryginale PDF, w formularzu lub w JSON, aby
          zaznaczyć je w pozostałych widokach.
        </span>
      </div>

      <div className={cn("grid gap-4", GRID_COLUMNS[panelCount])}>
        {views.original && (
          <OriginalPanel
            file={getFile(result.fileId)}
            fileName={result.fileName}
            form={form}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
        {views.form && (
          <FormPreview
            form={form}
            index={index}
            page={page}
            onPageChange={setPage}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
        {views.json && (
          <JsonPanel
            form={form}
            fieldIds={index.fieldIds}
            selectedId={selectedId}
            onSelect={select}
            onEditNode={(id, replacement) => onUpdateForm(replaceNode(form, id, replacement))}
          />
        )}
      </div>
    </>
  );
}

function Warnings({ warnings, onShow }) {
  return (
    <details open className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <TriangleAlert size={16} />
        Do sprawdzenia ({warnings.length})
      </summary>
      <ul className="max-h-40 space-y-1 overflow-auto border-t border-amber-200 px-4 py-2 text-sm">
        {warnings.map((warning, warningIndex) => (
          <li key={warningIndex} className="flex items-start gap-2">
            <span className="flex-1">{warning.text}</span>
            {(warning.id || warning.tabIndex !== null) && (
              <button
                type="button"
                onClick={() => onShow(warning)}
                className="shrink-0 rounded-sm text-xs font-semibold underline underline-offset-2 focus-ring hover:no-underline"
              >
                Pokaż
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DictionaryProposals({ proposals }) {
  return (
    <details className="rounded-xl border border-violet-200 bg-violet-50 text-violet-950">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
        Propozycje nowych słowników ({proposals.length})
      </summary>
      <ul className="max-h-40 space-y-2 overflow-auto border-t border-violet-200 px-4 py-2 text-sm">
        {proposals.map((proposal) => (
          <li key={proposal.name}>
            <p className="font-mono text-xs font-semibold">{proposal.name}</p>
            <p className="text-xs">Wartości: {proposal.values_example.join(", ")}</p>
            <p className="text-xs text-violet-800">Pola: {proposal.used_by.join(", ")}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
