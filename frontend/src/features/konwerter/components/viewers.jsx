// Podgląd oryginału: PDF (pdf.js, z warstwą tekstu dla czytników ekranu) i zdjęcia.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Maximize2, RotateCw, SearchX, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import { closePdf, loadPdfjs, openPdf } from "../lib/pdfjs.js";
import { findText } from "../lib/pdfSearch.js";
import { scrollToCenter } from "../lib/scroll.js";
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

/** Krótki znacznik w pasku narzędzi, gdy zaznaczonego pola nie ma na oryginale. */
function SearchChip({ search, result }) {
  if (!search || !result || result.status === "found") return null;
  const text = result.status === "noText" ? "Skan bez tekstu" : "Brak na oryginale";
  const hint =
    result.status === "noText"
      ? "Ten plik nie ma warstwy tekstu, więc nie wskażemy na nim pola."
      : `Na papierowym wniosku nie ma napisu „${search.label}”. Pole mogło zostać dodane według standardu eUsług.`;
  return (
    <span role="status" title={hint} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      <SearchX aria-hidden="true" size={13} />
      {text}
      <span className="sr-only">: {hint}</span>
    </span>
  );
}

/** Szuka etykiety zaznaczonego pola w tekście PDF-a. Nie zgadujemy: brak trafienia = brak ramki. */
function searchPages(pages, search) {
  if (!pages || !search) return null;
  if (pages.every((p) => p.items.every((item) => !item.trim()))) return { status: "noText" };
  const hit = findText(pages, search.label);
  return hit ? { status: "found", page: hit.page, text: search.label } : { status: "notFound" };
}

const FILLER = /^[\s.…_\-–—*:()]*$/;

/**
 * Do etykiety dokładamy sąsiednie „miejsca do wpisania” (kropki, podkreślenia, gwiazdkę)
 * z tej samej linii albo linii tuż nad nią, żeby ramka obejmowała całe pole na papierze.
 */
function expandWithFillers(layer, indices) {
  const rects = indices.map((index) => layer.divs[index]?.getBoundingClientRect()).filter(Boolean);
  if (!rects.length) return indices;
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const height = Math.max(4, bottom - top);
  const result = new Set(indices);
  const from = Math.max(0, Math.min(...indices) - 3);
  const to = Math.min(layer.divs.length - 1, Math.max(...indices) + 3);
  for (let index = from; index <= to; index += 1) {
    if (result.has(index)) continue;
    const text = layer.strs[index] ?? "";
    if (!text.trim() || !FILLER.test(text)) continue;
    const rect = layer.divs[index]?.getBoundingClientRect();
    if (!rect || rect.width === 0) continue;
    const sameLine = rect.top < bottom && rect.bottom > top;
    const lineAbove = rect.bottom <= top + 1 && top - rect.bottom < height * 1.6;
    if (sameLine || lineAbove) result.add(index);
  }
  return [...result];
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
  // Powiększenie wybrane przez urzędnika. Po zaznaczeniu pola widok sam się przybliża do niego
  // („tryb pola”), dopóki urzędnik nie zmieni powiększenia ręcznie.
  const [zoomState, setZoomState] = useState({ zoom: 1, fit: true, forKey: null });
  const [rendered, setRendered] = useState({ key: "", scale: 1 });
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
  const focusField = result?.status === "found" && zoomState.forKey !== search?.key;
  const { zoom, fit } = zoomState;
  const renderKey = `${page}|${zoom}|${fit}|${focusField}|${width}`;
  const setZoom = (value) => setZoomState({ zoom: value, fit: false, forKey: search?.key ?? null });
  const setFitWidth = () => setZoomState((current) => ({ ...current, fit: true, forKey: search?.key ?? null }));

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
    const labelDivs = (hit?.indices ?? []).map((index) => layer.divs[index]).filter(Boolean);
    labelDivs.forEach((div) => div.classList.add("kv-hit"));
    // Ramka wokół etykiety i jej miejsca do wpisania, z podpisem; reszta strony lekko przygaszona.
    const divs = expandWithFillers(layer, hit?.indices ?? []).map((index) => layer.divs[index]).filter(Boolean);
    const pageBox = canvasRef.current?.parentElement?.getBoundingClientRect();
    if (divs.length && pageBox) {
      const rects = divs.map((div) => div.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left)) - pageBox.left;
      const top = Math.min(...rects.map((r) => r.top)) - pageBox.top;
      const right = Math.max(...rects.map((r) => r.right)) - pageBox.left;
      const bottom = Math.max(...rects.map((r) => r.bottom)) - pageBox.top;
      setMarker({ left: left - 8, top: top - 6, width: right - left + 16, height: bottom - top + 12, label: search?.label ?? "" });
    } else {
      setMarker(null);
    }
    if (labelDivs[0]) scrollToCenter(scrollRef.current, labelDivs[0]);
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
    let currentScale = 1;
    (async () => {
      const lib = await loadPdfjs();
      const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const fitScale = Math.max(0.2, (width - 32) / base.width);
      // Tryb pola: około 2× szerzej niż strona, żeby etykieta i miejsce do wpisania były czytelne.
      const scale = focusField ? Math.min(3, Math.max(1.25, fitScale * 2)) : fit ? fitScale : zoom;
      const viewport = pdfPage.getViewport({ scale });
      currentScale = scale;
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
      .finally(() => !cancelled && setRendered({ key: renderKey, scale: currentScale }));
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
    // applyHighlight celowo poza zależnościami: zmiana zaznaczenia nie wymaga ponownego rysowania strony.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoom, fit, focusField, width, renderKey]);

  const busy = !doc || rendered.key !== renderKey;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <Toolbar label="Nawigacja po pliku PDF">
        <IconButton label="Poprzednia strona" icon={ChevronLeft} onClick={() => setPage(page - 1)} disabled={page <= 1} />
        <span className="min-w-24 text-center text-sm font-semibold text-slate-800" aria-live="polite">
          {numPages ? `Strona ${page} z ${numPages}` : "Wczytywanie…"}
        </span>
        <IconButton label="Następna strona" icon={ChevronRight} onClick={() => setPage(page + 1)} disabled={!numPages || page >= numPages} />
        <SearchChip search={search} result={result} />
        <ZoomControls zoom={focusField || !fit ? rendered.scale : zoom} fit={fit && !focusField} onZoom={setZoom} onFit={setFitWidth} />
      </Toolbar>
      {/* Przewijany obszar dostępny z klawiatury (strzałki), bo powiększona strona wystaje poza kolumnę. */}
      <div ref={scrollRef} tabIndex={0} role="region" aria-label={`Podgląd strony PDF: ${title}`} className="kv-scroll relative min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <Status icon={TriangleAlert}>{error}</Status>
        ) : (
          <div className="relative mx-auto w-fit overflow-hidden bg-white shadow-md ring-1 ring-slate-300">
            <canvas ref={canvasRef} role="img" aria-label={`Strona ${page} z ${numPages || "?"}: ${title}`} className="block" />
            <div ref={textRef} className="kv-textlayer" />
            {marker && (
              <div
                aria-hidden="true"
                className="kv-marker pointer-events-none absolute z-[2] rounded-md"
                style={{ left: marker.left, top: marker.top, width: marker.width, height: marker.height }}
              >
                <span className="absolute bottom-full left-0 mb-1 max-w-56 truncate rounded px-1.5 py-0.5 text-xs font-bold">{marker.label}</span>
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
export function ImageViewer({ url, title }) {
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
      <div tabIndex={0} role="region" aria-label={`Podgląd zdjęcia: ${title}`} className="kv-scroll min-h-0 flex-1 overflow-auto p-4">
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
  if (source?.kind === "image" && source.url) return <ImageViewer key={source.url} url={source.url} title={source.name} />;
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-sm text-slate-600">
      <TriangleAlert aria-hidden="true" size={26} className="text-amber-600" />
      <p className="max-w-sm font-semibold text-slate-800">Podgląd oryginału jest niedostępny</p>
      <p className="max-w-sm">{emptyHint ?? "Pliki Word i arkusze otworzysz w ich programie. Podgląd w przeglądarce działa dla PDF-ów i zdjęć."}</p>
    </div>
  );
}
