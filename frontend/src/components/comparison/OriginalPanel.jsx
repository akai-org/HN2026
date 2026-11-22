import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, FileQuestion, Minus, Plus } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { extractFormFile } from "@/lib/api";
import { fileUrl } from "@/lib/fileStore";
import { fileExtension } from "@/lib/uploads";
import Panel, { SegmentedControl } from "./Panel";
import PdfPage from "./PdfPage";
import usePdfOriginal from "./usePdfOriginal";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

// One request per file, also when the official switches views back and forth.
const extractions = new WeakMap();

/** "pdf" and "image" have a browser preview; Word files and sheets ("document") only the text read by the backend. */
function fileKind(fileName) {
  const extension = fileExtension(fileName);
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "document";
}

function readDocument(file) {
  if (!extractions.has(file)) {
    const request = extractFormFile(file).catch((error) => {
      extractions.delete(file); // let the next attempt ask again
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

/** Page the PDF shows: it follows the selected field to its page; manual paging wins until the next selection. */
function useFollowedPage(selectedId, hit) {
  const [page, setPage] = useState(1);
  const [followed, setFollowed] = useState(null);
  const target = hit ? `${selectedId}@${hit.page}` : null;
  if (target !== followed) {
    setFollowed(target);
    if (hit) setPage(hit.page);
  }
  return [page, setPage];
}

export default function OriginalPanel({ file, fileName, form, selectedId, onSelect }) {
  const kind = fileKind(file?.name || fileName);
  const [view, setView] = useState(kind === "document" ? "text" : "file");
  const [zoom, setZoom] = useState(100);
  const [attempt, setAttempt] = useState(0);
  const url = file ? fileUrl(file) : null;
  const extracted = useExtractedDocument(file, view === "text", attempt);

  const pdf = usePdfOriginal(kind === "pdf" ? file : null, form);
  const hit = selectedId ? pdf.matches.get(selectedId) : null;
  const [page, setPage] = useFollowedPage(selectedId, hit);
  const numPages = pdf.doc?.numPages ?? 0;
  const shownPage = Math.min(page, Math.max(1, numPages));
  const showsPdf = kind === "pdf" && view === "file";

  let pdfNote = null;
  if (showsPdf && pdf.pdfIndex?.empty) {
    pdfNote = {
      text: "Skan bez tekstu",
      hint: "Ten PDF nie ma warstwy tekstu, więc nie da się wskazać na nim pól.",
    };
  } else if (showsPdf && pdf.pdfIndex && selectedId && !hit) {
    pdfNote = {
      text: "Brak na oryginale",
      hint: "Na oryginale nie ma napisu pasującego do zaznaczonego pola. Pole mogło zostać dodane według standardu e-formularzy.",
    };
  }

  const actions = file && (
    <>
      {pdfNote && (
        <span
          role="status"
          title={pdfNote.hint}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {pdfNote.text}
          <span className="sr-only">: {pdfNote.hint}</span>
        </span>
      )}
      {showsPdf && numPages > 1 && (
        <div className="flex items-center gap-0.5" role="group" aria-label="Strony PDF">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Poprzednia strona"
            disabled={shownPage <= 1}
            onClick={() => setPage(shownPage - 1)}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-10 text-center text-xs text-muted-foreground tabular-nums"
            aria-live="polite"
          >
            <span className="sr-only">Strona </span>
            {shownPage} / {numPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Następna strona"
            disabled={shownPage >= numPages}
            onClick={() => setPage(shownPage + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
      {view === "file" && kind !== "document" && <ZoomControls zoom={zoom} onZoom={setZoom} />}
      {url && kind !== "document" && view === "file" && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
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
        <ExtractedText state={extracted} kind={kind} onRetry={() => setAttempt((count) => count + 1)} />
      ) : !url ? null : kind === "pdf" ? (
        pdf.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-xs text-sm text-destructive" role="alert">
              {pdf.error}
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Otwórz w nowej karcie
            </a>
          </div>
        ) : !pdf.doc ? (
          <div
            className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground"
            role="status"
          >
            <span className="loader" aria-hidden="true" />
            Wczytywanie pliku PDF…
          </div>
        ) : (
          <PdfPage
            doc={pdf.doc}
            page={shownPage}
            zoom={zoom}
            fileName={file.name}
            pdfIndex={pdf.pdfIndex}
            matches={pdf.matches}
            titles={pdf.titles}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )
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

/** Zoom in percent of the panel width (100 = fit to width), shared by the PDF and image views. */
function ZoomControls({ zoom, onZoom }) {
  const zoomIndex = ZOOM_STEPS.indexOf(zoom);
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Powiększenie">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Pomniejsz"
        disabled={zoomIndex <= 0}
        onClick={() => onZoom(ZOOM_STEPS[zoomIndex - 1])}
      >
        <Minus />
      </Button>
      <button
        type="button"
        title="Dopasuj do szerokości"
        onClick={() => onZoom(100)}
        className="min-w-11 rounded-md px-1 text-xs text-muted-foreground tabular-nums focus-ring hover:bg-muted"
      >
        {zoom}%
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Powiększ"
        disabled={zoomIndex >= ZOOM_STEPS.length - 1}
        onClick={() => onZoom(ZOOM_STEPS[zoomIndex + 1])}
      >
        <Plus />
      </Button>
    </div>
  );
}

function MissingFile() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion size={36} className="text-muted-foreground" />
      <p className="max-w-xs text-sm text-muted-foreground">
        Oryginał nie jest już dostępny. Pliki są trzymane tylko w pamięci przeglądarki, więc po odświeżeniu
        strony trzeba je dodać ponownie.
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
        <p className="max-w-xs text-sm text-destructive" role="alert">
          {state.message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }
  if (state.status !== "done") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground"
        role="status"
      >
        <span className="loader" aria-hidden="true" />
        {kind === "document"
          ? "Odczytywanie pliku…"
          : "Odczytywanie tekstu z pliku (skany przechodzą przez OCR)…"}
      </div>
    );
  }

  const pages = Map.groupBy(state.document.blocks, (block) => block.page);

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
            <p className="border-b pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
                  <td key={cellIndex} className="border px-2 py-1 align-top whitespace-pre-wrap">
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
  return <p className="break-words whitespace-pre-wrap">{block.text}</p>;
}
