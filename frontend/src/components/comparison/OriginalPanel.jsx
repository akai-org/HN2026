import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileQuestion, Minus, Plus } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { extractFormFile } from "@/lib/api";
import { fileUrl } from "@/lib/fileStore";
import { cn } from "@/lib/utils";
import Panel, { SegmentedControl } from "./Panel";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

// One request per file, also when the official switches views back and forth.
const extractions = new WeakMap();

/** "pdf" and "image" have a browser preview; Word files and sheets ("document") only the text read by the backend. */
function fileKind(fileName) {
  const extension = (fileName || "").split(".").pop().toLowerCase();
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "document";
}

function readDocument(file) {
  if (!extractions.has(file)) {
    const request = extractFormFile(file).catch((error) => {
      extractions.delete(file);   // allow a retry
      throw error;
    });
    extractions.set(file, request);
  }
  return extractions.get(file);
}

/** `{status: "loading" | "done" | "error"}` of the backend's reading of the file; a new attempt retries. */
function useExtractedDocument(file, enabled, attempt) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!file || !enabled) return undefined;
    let active = true;
    readDocument(file).then(
      (document) => active && setResult({ file, attempt, status: "done", document }),
      (error) => active && setResult({ file, attempt, status: "error", message: error.message }),
    );
    return () => {
      active = false;
    };
  }, [file, enabled, attempt]);
  return result?.file === file && result.attempt === attempt ? result : { status: "loading" };
}

export default function OriginalPanel({ file, fileName }) {
  const kind = fileKind(file?.name || fileName);
  const [view, setView] = useState(kind === "document" ? "text" : "file");
  const [zoom, setZoom] = useState(100);
  const [attempt, setAttempt] = useState(0);
  const url = file ? fileUrl(file) : null;
  const extracted = useExtractedDocument(file, view === "text", attempt);

  const zoomIndex = ZOOM_STEPS.indexOf(zoom);
  const actions = file && (
    <>
      {view === "file" && kind === "image" && (
        <div className="flex items-center gap-0.5" role="group" aria-label="Powiększenie">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
            aria-label="Pomniejsz"
            disabled={zoomIndex <= 0}
            onClick={() => setZoom(ZOOM_STEPS[zoomIndex - 1])}
          >
            <Minus />
          </button>
          <button
            type="button"
            className="min-w-11 rounded-md px-1 text-xs tabular-nums text-muted-foreground hover:bg-muted"
            title="Dopasuj do szerokości"
            onClick={() => setZoom(100)}
          >
            {zoom}%
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
            aria-label="Powiększ"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => setZoom(ZOOM_STEPS[zoomIndex + 1])}
          >
            <Plus />
          </button>
        </div>
      )}
      {url && kind !== "document" && view === "file" && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
          aria-label="Otwórz oryginał w nowej karcie"
          title="Otwórz w nowej karcie"
        >
          <ExternalLink />
        </a>
      )}
      <SegmentedControl
        label="Widok oryginału"
        value={view}
        onChange={setView}
        options={[
          {
            value: "file",
            label: "Plik",
            disabled: kind === "document",
            title: kind === "document" ? "Przeglądarka nie wyświetla plików Word ani arkuszy" : undefined,
          },
          { value: "text", label: "Odczytany tekst" },
        ]}
      />
    </>
  );

  return (
    <Panel
      number={1}
      title="Oryginał"
      subtitle={fileName}
      actions={actions}
      bodyClassName={view === "file" && kind !== "document" ? "bg-muted/60" : undefined}
    >
      {!file ? (
        <MissingFile />
      ) : view === "text" ? (
        <ExtractedText
          state={extracted}
          kind={kind}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      ) : !url ? null : kind === "pdf" ? (
        <iframe
          title={`Oryginał: ${file.name}`}
          src={`${url}#view=FitH&navpanes=0`}
          className="block h-full w-full border-0"
        />
      ) : (
        <div className="p-3">
          <img
            src={url}
            alt={`Skan formularza ${file.name}`}
            style={{ width: `${zoom}%` }}
            className="mx-auto block max-w-none bg-white shadow-md"
          />
        </div>
      )}
    </Panel>
  );
}

function MissingFile() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion size={36} className="text-muted-foreground" />
      <p className="max-w-xs text-sm text-muted-foreground">
        Oryginał nie jest już dostępny. Pliki są trzymane tylko w pamięci przeglądarki, więc po odświeżeniu strony
        trzeba je dodać ponownie.
      </p>
      <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Dodaj pliki
      </Link>
    </div>
  );
}

function ExtractedText({ state, kind, onRetry }) {
  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-xs text-sm text-destructive" role="alert">{state.message}</p>
        <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })} onClick={onRetry}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }
  if (state.status !== "done") {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground" role="status">
        {kind === "document" ? "Odczytywanie pliku…" : "Odczytywanie tekstu z pliku (skany przechodzą przez OCR)…"}
      </p>
    );
  }

  const pages = new Map();
  for (const block of state.document.blocks) {
    if (!pages.has(block.page)) pages.set(block.page, []);
    pages.get(block.page).push(block);
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {kind === "document"
          ? "Przeglądarka nie wyświetla plików Word ani arkuszy, dlatego pokazujemy tekst odczytany z pliku. "
          : ""}
        Na tym tekście pracował model AI. Kreski „____” oznaczają miejsca do wpisania odpowiedzi.
      </p>
      {pages.size === 0 && <p className="text-muted-foreground">Nie odczytano żadnego tekstu.</p>}
      {[...pages].map(([page, blocks]) => (
        <section key={page} aria-label={`Strona ${page}`} className="space-y-2">
          {pages.size > 1 && (
            <p className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Strona {page}
            </p>
          )}
          {blocks.map((block, index) => (
            <TextBlock key={index} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}

function TextBlock({ block }) {
  if (block.kind === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {(block.rows || []).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-pre-wrap border border-border px-2 py-1 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.kind === "checkbox") {
    return (
      <p className="flex gap-2">
        <span aria-hidden="true">{block.checked ? "☑" : "☐"}</span>
        <span className="sr-only">{block.checked ? "Zaznaczone pole wyboru:" : "Pole wyboru:"}</span>
        <span>{block.text}</span>
      </p>
    );
  }
  return <p className="whitespace-pre-wrap break-words">{block.text}</p>;
}
