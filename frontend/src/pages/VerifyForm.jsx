import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Download, TriangleAlert } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import FormPreview from "@/components/comparison/FormPreview";
import JsonPanel from "@/components/comparison/JsonPanel";
import OriginalPanel from "@/components/comparison/OriginalPanel";
import { getFile } from "@/lib/fileStore";
import { downloadJson, indexForm, plural, resolveWarning } from "@/lib/formDefinition";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "original", label: "Oryginał" },
  { key: "form", label: "Formularz" },
  { key: "json", label: "JSON" },
];
const VIEWS_STORAGE_KEY = "uniform-comparison-views";
const VERIFY_ITEMS_STORAGE_KEY = "uniform-verify-items";
const DEFAULT_VIEWS = { original: true, form: true, json: true };

function readViews() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY) || "null");
    if (saved && VIEWS.some(({ key }) => saved[key])) return { ...DEFAULT_VIEWS, ...saved };
  } catch {
    // storage unavailable (private mode, blocked site data): use the default layout
  }
  return DEFAULT_VIEWS;
}

function saveViews(views) {
  try {
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch {
    // the layout is only a convenience
  }
}

function readVerifyItems() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VERIFY_ITEMS_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveVerifyItems(items) {
  try {
    sessionStorage.setItem(VERIFY_ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // session data is optional; the app remains usable without storage
  }
}

export default function VerifyForm() {
  const location = useLocation();
  const stateItems = location.state?.convertedForms;
  const items = stateItems?.length ? stateItems : readVerifyItems();
  const [current, setCurrent] = useState(0);
  const [views, setViews] = useState(readViews);
  const item = items[Math.min(current, items.length - 1)];

  // The router keeps the previous page's scroll position; the comparison starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (stateItems?.length) saveVerifyItems(stateItems);
  }, [stateItems]);

  function toggleView(key) {
    setViews((currentViews) => {
      const next = { ...currentViews, [key]: !currentViews[key] };
      if (!VIEWS.some(({ key: name }) => next[name])) return currentViews;   // keep at least one panel
      saveViews(next);
      return next;
    });
  }

  if (!item) {
    return (
      <main id="main-content" tabIndex="-1" className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Brak formularza do sprawdzenia</h1>
          <p className="mt-2 text-sm text-muted-foreground">Dodaj plik z formularzem, żeby porównać go z wersją cyfrową.</p>
          <Link to="/" className={cn(buttonVariants(), "mt-4")}>Dodaj formularz</Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex="-1" className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1800px]">
        <Comparison
          key={`${current}-${item.fileId || item.fileName}`}
          item={item}
          items={items}
          current={current}
          onCurrentChange={setCurrent}
          views={views}
          onToggleView={toggleView}
          backState={location.state}
        />
      </div>
    </main>
  );
}

function Comparison({ item, items, current, onCurrentChange, views, onToggleView, backState }) {
  const result = item.convertedForm;
  const form = result?.form;
  const index = useMemo(() => indexForm(form), [form]);
  const file = getFile(item.fileId);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  const warnings = useMemo(
    () => (result?.warnings || []).map((warning) => resolveWarning(warning, form)),
    [result, form],
  );
  const proposals = result?.proposed_dictionaries || [];
  const pageCount = form?.tabs?.length || 0;

  function select(id) {
    setSelectedId((currentId) => (currentId === id ? null : id));
    const tabIndex = index.byId.get(id)?.tabIndex;
    if (tabIndex !== undefined) setPage(tabIndex);
  }

  function showWarning(warning) {
    if (warning.tabIndex !== null) setPage(warning.tabIndex);
    if (warning.id) setSelectedId(warning.id);
  }

  const visible = VIEWS.filter(({ key }) => views[key]);
  const gridColumns = visible.length === 3 ? "lg:grid-cols-2 xl:grid-cols-3" : visible.length === 2 ? "lg:grid-cols-2" : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Link to="/digitalize" state={backState} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Wróć
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{form?.title || "Formularz bez tytułu"}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {item.fileName} · {pageCount} {plural(pageCount, "strona", "strony", "stron")} · {index.fieldCount}{" "}
            {plural(index.fieldCount, "pole", "pola", "pól")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Plik</span>
              <select
                value={current}
                onChange={(event) => onCurrentChange(Number(event.target.value))}
                className="h-10 max-w-72 rounded-lg border border-foreground/25 bg-background px-3 py-2 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {items.map((entry, entryIndex) => (
                  <option key={entryIndex} value={entryIndex}>
                    Formularz {entry.formNumber || 1} · {entry.fileName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className={buttonVariants()} onClick={() => downloadJson(form)}>
            <Download />
            Pobierz JSON
          </button>
        </div>
      </div>

      {(warnings.length > 0 || proposals.length > 0) && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {warnings.length > 0 && (
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
                        className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
                        onClick={() => showWarning(warning)}
                      >
                        Pokaż
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {proposals.length > 0 && (
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
          )}
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
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                views[key]
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/25 bg-background text-foreground shadow-sm hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hidden max-w-72 text-right text-xs text-muted-foreground md:inline">
          Porównaj oryginał z wersją cyfrową. Kliknij element formularza lub JSON, aby zaznaczyć go po drugiej stronie.
        </span>
      </div>

      <div className={cn("grid gap-4", gridColumns)}>
        {views.original && <OriginalPanel file={file} fileName={item.fileName} />}
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
            selectedId={selectedId}
            fieldIds={index.fieldIds}
            onSelect={select}
          />
        )}
      </div>
    </>
  );
}
