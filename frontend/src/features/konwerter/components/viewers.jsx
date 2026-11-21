// Podgląd oryginału: PDF (pdf.js, z warstwą tekstu dla czytników ekranu) i zdjęcia.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair, LoaderCircle, Maximize2, RotateCw, SearchX, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import { closePdf, loadPdfjs, openPdf } from "../lib/pdfjs.js";
import { findText } from "../lib/pdfSearch.js";
import { scrollWithin } from "../lib/scroll.js";
import { IconButton } from "./primitives.jsx";

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function nextZoom(current, direction) {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 0.001) ?? current;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current;
}

/** Szerokość elementu aktualizowana przy zmianie rozmiaru (kolumny można rozciągać). */
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function Toolbar({ children, label }) {
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
      {children}
    </div>
  );
}

function ZoomControls({ zoom, fit, onZoom, onFit }) {
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <IconButton label="Pomniejsz" icon={ZoomOut} onClick={() => onZoom(nextZoom(zoom, -1))} disabled={zoom <= ZOOM_STEPS[0]} />
      <output className="w-14 text-center text-sm font-semibold tabular-nums text-slate-800" aria-live="polite">
        {fit ? "Dopas." : `${Math.round(zoom * 100)}%`}
      </output>
      <IconButton label="Powiększ" icon={ZoomIn} onClick={() => onZoom(nextZoom(zoom, 1))} disabled={zoom >= ZOOM_STEPS.at(-1)} />
      <IconButton label="Dopasuj do szerokości" icon={Maximize2} onClick={onFit} aria-pressed={fit} />
    </div>
  );
}

function Status({ icon: Icon, children, spin }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
      <Icon aria-hidden="true" size={28} className={spin ? "motion-safe:animate-spin text-(--blue)" : "text-amber-600"} />
      {children}
    </div>
  );
}

/** Pasek pod narzędziami: czy zaznaczone pole udało się znaleźć w oryginale. */
function SearchStatus({ search, result }) {
  if (!search) return null;
  let icon = Crosshair;
  let text;
  let tone = "bg-(--kv-highlight) text-slate-900";
  if (result?.status === "found") {
    text = (
      <>
        Zaznaczone pole „{search.label}”: {result.viaParent ? `pokazujemy sekcję „${result.text}”` : "podświetlone"} na stronie {result.page}.
      </>
    );
  } else if (result?.status === "noText") {
    icon = SearchX;
    tone = "bg-slate-100 text-slate-700";
    text = "Ten plik to skan bez warstwy tekstu, więc nie wskażemy na nim pola.";
  } else if (result?.status === "notFound") {
    icon = SearchX;
    tone = "bg-slate-100 text-slate-700";
    text = `Nie ma napisu „${search.label}” na oryginale. To pole mogło zostać dodane według standardu eUsług.`;
  } else {
    return null;
  }
  const Icon = icon;
  return (
    <p role="status" className={`flex items-start gap-2 border-b border-slate-200 px-3 py-1.5 text-sm ${tone}`}>
      <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/** Pierwsza pasująca fraza z listy (np. etykieta pola, potem tytuł jego sekcji). */
function searchPages(pages, search) {
  if (!pages || !search) return null;
  if (pages.every((p) => p.items.every((item) => !item.trim()))) return { status: "noText" };
  for (const [index, query] of search.queries.entries()) {
    const hit = findText(pages, query);
    if (hit) return { status: "found", page: hit.page, text: query, viaParent: index > 0 };
  }
  return { status: "notFound" };
}

/**
 * Podgląd PDF z nawigacją po stronach i powiększeniem.
 * Źródło: `url` (blob:/http) albo `file` (Blob/File). Komponent trzeba montować z key = źródło,
 * wtedy zmiana pliku zaczyna od czystego stanu.
 * search: { key, label, queries: string[] } — etykieta zaznaczonego pola do podświetlenia na oryginale.
 */
export function PdfViewer({ url, file, title, search }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [pageState, setPageState] = useState({ value: 1, forKey: null });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [renderedKey, setRenderedKey] = useState("");
  const [pageTexts, setPageTexts] = useState(null);
  const [marker, setMarker] = useState(null);
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const layerRef = useRef(null);
  const width = useWidth(scrollRef);
  const numPages = doc?.numPages ?? 0;
  const result = useMemo(() => searchPages(pageTexts, search), [pageTexts, search]);
  // Nowe zaznaczenie przełącza na stronę z polem; ręczna zmiana strony wygrywa do następnego zaznaczenia.
  const page = result?.status === "found" && pageState.forKey !== search?.key ? result.page : pageState.value;
  const renderKey = `${page}|${zoom}|${fit}|${width}`;

  const setPage = useCallback(
    (value) => setPageState({ value: Math.min(Math.max(1, value), numPages || 1), forKey: search?.key ?? null }),
    [numPages, search],
  );

  // Tekst wszystkich stron (raz na plik) do wyszukiwania etykiet pól.
  useEffect(() => {
    if (!doc) return undefined;
    let cancelled = false;
    (async () => {
      const pages = [];
      for (let number = 1; number <= doc.numPages; number += 1) {
        const content = await (await doc.getPage(number)).getTextContent();
        pages.push({ items: content.items.filter((item) => "str" in item).map((item) => item.str) });
      }
      if (!cancelled) setPageTexts(pages);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);

  /** Zaznacza na warstwie tekstu fragmenty z etykietą pola i przewija do nich. */
  const applyHighlight = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.divs.forEach((div) => div.classList.remove("kv-hit"));
    if (result?.status !== "found" || layer.page !== result.page) {
      setMarker(null);
      return;
    }
    const hit = findText([{ items: layer.strs }], result.text);
    const divs = (hit?.indices ?? []).map((index) => layer.divs[index]).filter(Boolean);
    divs.forEach((div) => div.classList.add("kv-hit"));
    // Ramka wokół etykiety z podpisem (jak marker w makiecie), widoczna także przy małym powiększeniu.
    const pageBox = canvasRef.current?.parentElement?.getBoundingClientRect();
    if (divs.length && pageBox) {
      const rects = divs.map((div) => div.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left)) - pageBox.left;
      const top = Math.min(...rects.map((r) => r.top)) - pageBox.top;
      const right = Math.max(...rects.map((r) => r.right)) - pageBox.left;
      const bottom = Math.max(...rects.map((r) => r.bottom)) - pageBox.top;
      setMarker({ left: left - 6, top: top - 5, width: right - left + 12, height: bottom - top + 10, label: search?.label ?? "" });
    } else {
      setMarker(null);
    }
    if (divs[0]) scrollWithin(scrollRef.current, divs[0], "center");
  }, [result, search?.label]);

  useEffect(() => {
    applyHighlight();
  }, [applyHighlight, search?.key]);

  useEffect(() => {
    let cancelled = false;
    let loaded = null;
    (async () => (file ? openPdf(new Uint8Array(await file.arrayBuffer())) : openPdf(url)))()
      .then((pdf) => {
        loaded = pdf;
        if (cancelled) closePdf(pdf);
        else setDoc(pdf);
      })
      .catch(() => !cancelled && setError("Nie udało się otworzyć pliku PDF."));
    return () => {
      cancelled = true;
      closePdf(loaded);
    };
  }, [url, file]);

  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    let task = null;
    let textLayer = null;
    (async () => {
      const lib = await loadPdfjs();
      const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = fit ? Math.max(0.2, (width - 32) / base.width) : zoom;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      const container = textRef.current;
      if (!canvas || !container) return;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = pdfPage.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await task.promise;
      if (cancelled) return;
      container.replaceChildren();
      container.style.setProperty("--scale-factor", String(scale));
      container.style.setProperty("--total-scale-factor", String(scale));
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;
      textLayer = new lib.TextLayer({ textContentSource: pdfPage.streamTextContent(), container, viewport });
      await textLayer.render();
      if (cancelled) return;
      layerRef.current = { page: Math.min(page, doc.numPages), divs: textLayer.textDivs, strs: textLayer.textContentItemsStr };
      applyHighlight();
    })()
      .catch((renderError) => {
        if (!cancelled && renderError?.name !== "RenderingCancelledException") setError("Nie udało się wyświetlić strony.");
      })
      .finally(() => !cancelled && setRenderedKey(renderKey));
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
    // applyHighlight celowo poza zależnościami: zmiana zaznaczenia nie wymaga ponownego rysowania strony.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoom, fit, width, renderKey]);

  const busy = !doc || renderedKey !== renderKey;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <Toolbar label="Nawigacja po pliku PDF">
        <IconButton label="Poprzednia strona" icon={ChevronLeft} onClick={() => setPage(page - 1)} disabled={page <= 1} />
        <span className="min-w-24 text-center text-sm font-semibold text-slate-800" aria-live="polite">
          {numPages ? `Strona ${page} z ${numPages}` : "Wczytywanie…"}
        </span>
        <IconButton label="Następna strona" icon={ChevronRight} onClick={() => setPage(page + 1)} disabled={!numPages || page >= numPages} />
        <ZoomControls
          zoom={zoom}
          fit={fit}
          onZoom={(value) => {
            setFit(false);
            setZoom(value);
          }}
          onFit={() => setFit(true)}
        />
      </Toolbar>
      <SearchStatus search={search} result={result} />
      <div ref={scrollRef} className="kv-scroll relative min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <Status icon={TriangleAlert}>{error}</Status>
        ) : (
          <div className="relative mx-auto w-fit bg-white shadow-md ring-1 ring-slate-300">
            <canvas ref={canvasRef} role="img" aria-label={`Strona ${page} z ${numPages || "?"}: ${title}`} className="block" />
            <div ref={textRef} className="kv-textlayer" />
            {marker && (
              <div
                aria-hidden="true"
                className="kv-marker pointer-events-none absolute z-[2] rounded-md"
                style={{ left: marker.left, top: marker.top, width: marker.width, height: marker.height }}
              >
                <span className="absolute bottom-full left-0 mb-1 max-w-56 truncate rounded px-1.5 py-0.5 text-[11px] font-bold">{marker.label}</span>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 flex min-h-48 min-w-48 items-center justify-center bg-white/60">
                <LoaderCircle aria-hidden="true" size={26} className="text-(--blue) motion-safe:animate-spin" />
                <span className="sr-only">Wczytywanie strony</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Podgląd zdjęcia z powiększeniem i obrotem (tylko do oglądania). */
export function ImageViewer({ url, title, search }) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [failed, setFailed] = useState(false);
  const quarter = rotation % 180 !== 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <Toolbar label="Narzędzia podglądu zdjęcia">
        <IconButton label="Obróć o 90°" icon={RotateCw} onClick={() => setRotation((value) => (value + 90) % 360)} />
        <ZoomControls
          zoom={zoom}
          fit={fit}
          onZoom={(value) => {
            setFit(false);
            setZoom(value);
          }}
          onFit={() => setFit(true)}
        />
      </Toolbar>
      <SearchStatus search={search} result={search ? { status: "noText" } : null} />
      <div className="kv-scroll min-h-0 flex-1 overflow-auto p-4">
        {failed ? (
          <Status icon={TriangleAlert}>Nie udało się wyświetlić zdjęcia.</Status>
        ) : (
          <div className={`flex min-h-full items-center justify-center ${quarter ? "py-[15%]" : ""}`}>
            <img
              src={url}
              alt={`Podgląd: ${title}`}
              onError={() => setFailed(true)}
              style={{
                transform: `rotate(${rotation}deg)`,
                width: fit ? (quarter ? "auto" : "100%") : `${zoom * 100}%`,
                maxWidth: fit ? "100%" : "none",
                maxHeight: fit && quarter ? "70vh" : undefined,
              }}
              className="bg-white shadow-md ring-1 ring-slate-300 transition-transform"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Wybiera właściwy podgląd dla źródła { kind, url, name }. */
export function SourceViewer({ source, emptyHint, search }) {
  if (source?.kind === "pdf" && source.file) return <PdfViewer key={`${source.name}-${source.file.size}`} file={source.file} title={source.name} search={search} />;
  if (source?.kind === "pdf" && source.url) return <PdfViewer key={source.url} url={source.url} title={source.name} search={search} />;
  if (source?.kind === "image" && source.url) return <ImageViewer key={source.url} url={source.url} title={source.name} search={search} />;
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-sm text-slate-600">
      <TriangleAlert aria-hidden="true" size={26} className="text-amber-600" />
      <p className="max-w-sm font-semibold text-slate-800">Podgląd oryginału jest niedostępny</p>
      <p className="max-w-sm">{emptyHint ?? "Pliki Word i arkusze otworzysz w ich programie. Podgląd w przeglądarce działa dla PDF-ów i zdjęć."}</p>
    </div>
  );
}
