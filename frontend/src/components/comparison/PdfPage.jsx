// The original PDF drawn with pdf.js, linked with the form both ways:
// - the field selected in the form or the JSON is highlighted on the original,
// - clicking a label (or the space to write in) on the original selects that field.
//
// The backend does not return where fields are on paper, so field titles are looked up in the PDF's text layer
// (lib/pdfSearch.js). That only works for PDFs with text: a scan without a text layer has nothing to match.
import { useEffect, useMemo, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdfjs";

/** Width of the element's content box, updated when the panel is resized. */
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

const FILLER_ITEM = /^[\s.…_\-–—*:()/]*$/;
const FILLER_RUN = /[.…_\-–—]{3,}/;

/** Screen rectangle of a range of characters in a text layer element (a span with one text node). */
function rangeRect(div, start, end) {
  const node = div?.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return div?.getBoundingClientRect() ?? null;
  const length = node.textContent.length;
  const range = document.createRange();
  range.setStart(node, Math.min(start, length));
  range.setEnd(node, Math.min(end, length));
  const rect = range.getBoundingClientRect();
  return rect.width > 0 ? rect : null;
}

/**
 * Rectangles of a field on the page: the words of its label and (lighter) the space to write in next to it —
 * dots in the same text, in a neighbouring fragment of the same line, or a dotted line just above a caption.
 */
function highlightRects(layer, marks) {
  const labels = [];
  const areas = [];
  const used = new Set();
  marks.forEach((mark) => {
    const div = layer.divs[mark.item];
    const rect = rangeRect(div, mark.start, mark.end);
    if (!rect) return;
    labels.push(rect);
    const rest = (layer.strs[mark.item] ?? "").slice(mark.end);
    const run = FILLER_RUN.exec(rest);
    if (run && !/\p{L}/u.test(rest.slice(0, run.index))) {
      const area = rangeRect(div, mark.end + run.index, mark.end + run.index + run[0].length);
      if (area) areas.push(area);
      return;
    }
    if (used.has(mark.item)) return;
    used.add(mark.item);
    let sameLine = null;
    let lineAbove = null;
    for (
      let index = Math.max(0, mark.item - 4);
      index <= Math.min(layer.divs.length - 1, mark.item + 4);
      index += 1
    ) {
      const candidate = layer.strs[index] ?? "";
      if (
        index === mark.item ||
        !candidate.trim() ||
        !FILLER_ITEM.test(candidate) ||
        candidate.trim().length < 3
      )
        continue;
      const box = layer.divs[index]?.getBoundingClientRect();
      if (!box || box.width === 0) continue;
      if (box.top < rect.bottom && box.bottom > rect.top && index > mark.item) sameLine ??= box;
      else if (box.bottom <= rect.top + 1 && rect.top - box.bottom < rect.height * 1.6) lineAbove = box;
    }
    if (sameLine ?? lineAbove) areas.push(sameLine ?? lineAbove);
  });
  return { labels, areas };
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Scrolls the container so the page-relative boxes are visible; does nothing when they already are. */
function revealBoxes(container, pageElement, boxes) {
  if (!container || !pageElement || !boxes.length) return;
  const page = pageElement.getBoundingClientRect();
  const view = container.getBoundingClientRect();
  const top = page.top + Math.min(...boxes.map((box) => box.top));
  const bottom = page.top + Math.max(...boxes.map((box) => box.top + box.height));
  const left = page.left + Math.min(...boxes.map((box) => box.left));
  const right = page.left + Math.max(...boxes.map((box) => box.left + box.width));
  const margin = 12;
  const fitsVertically = top >= view.top + margin && bottom <= view.bottom - margin;
  const fitsHorizontally = left >= view.left + margin && right <= view.right - margin;
  if (fitsVertically && fitsHorizontally) return;
  container.scrollTo({
    top: fitsVertically
      ? container.scrollTop
      : Math.max(0, top - view.top + container.scrollTop - (container.clientHeight - (bottom - top)) / 2),
    left: fitsHorizontally
      ? container.scrollLeft
      : Math.max(0, left - view.left + container.scrollLeft - (container.clientWidth - (right - left)) / 2),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/**
 * One page of the PDF: canvas, a transparent text layer (selectable, read by screen readers),
 * the highlight of the selected field and invisible click targets over every field found on the page.
 * zoom: percent of the panel width (100 = fit to width).
 */
export default function PdfPage({
  doc,
  page,
  zoom,
  fileName,
  pdfIndex,
  matches,
  titles,
  selectedId,
  onSelect,
}) {
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const width = useWidth(scrollRef);
  const [layer, setLayer] = useState(null);
  const [failed, setFailed] = useState(false);
  const renderKey = `${page}|${zoom}|${width}`;

  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    let task = null;
    let textLayer = null;
    (async () => {
      const lib = await loadPdfjs();
      const number = Math.min(page, doc.numPages);
      const pdfPage = await doc.getPage(number);
      const canvas = canvasRef.current;
      const container = textRef.current;
      if (cancelled || !canvas || !container) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.max(0.2, (width / base.width) * (zoom / 100)) });
      const ratio = window.devicePixelRatio || 1;
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
      container.style.setProperty("--scale-factor", String(viewport.scale));
      container.style.setProperty("--total-scale-factor", String(viewport.scale));
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;
      textLayer = new lib.TextLayer({ textContentSource: pdfPage.streamTextContent(), container, viewport });
      await textLayer.render();
      if (cancelled) return;
      setFailed(false);
      setLayer({
        key: `${page}|${zoom}|${width}`,
        page: number,
        element: container.parentElement,
        divs: textLayer.textDivs,
        strs: textLayer.textContentItemsStr,
      });
    })().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") setFailed(true);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, zoom, width]);

  // Boxes (relative to the page) of every field found on the rendered page.
  const boxes = useMemo(() => {
    const result = new Map();
    if (!layer || !pdfIndex || pdfIndex.empty) return result;
    const pageBox = layer.element.getBoundingClientRect();
    const items = pdfIndex.pages[layer.page - 1]?.items ?? [];
    const toBox = (rect) => ({
      left: rect.left - pageBox.left - 2,
      top: rect.top - pageBox.top - 1,
      width: rect.width + 4,
      height: rect.height + 2,
    });
    matches.forEach((hit, id) => {
      if (hit.page !== layer.page) return;
      // Fragment indexes from pdf.js and the text layer are the same; if they ever differ, highlight nothing.
      const valid = hit.marks.filter((mark) => layer.strs[mark.item] === items[mark.item]?.str);
      const { labels, areas } = highlightRects(layer, valid);
      if (labels.length) {
        result.set(id, {
          labels: labels.map(toBox),
          areas: areas.map(toBox),
          fromChildren: Boolean(hit.fromChildren),
        });
      }
    });
    return result;
  }, [layer, pdfIndex, matches]);

  const busy = !layer || layer.key !== renderKey;
  const selected = !busy && selectedId ? boxes.get(selectedId) : null;
  // A section without its own title on paper is highlighted through its fields; those fields are the click targets.
  const targets = busy ? [] : [...boxes].filter(([, box]) => !box.fromChildren);

  useEffect(() => {
    if (selected) revealBoxes(scrollRef.current, layer?.element, [...selected.labels, ...selected.areas]);
  }, [selected, layer]);

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={`Podgląd strony PDF: ${fileName}`}
      className="absolute inset-0 [scrollbar-gutter:stable] overflow-auto p-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
    >
      {failed ? (
        <p className="p-6 text-center text-sm text-destructive" role="alert">
          Nie udało się wyświetlić strony.
        </p>
      ) : (
        <div className="relative mx-auto w-fit bg-white shadow-md ring-1 ring-black/10">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Strona ${page} z ${doc?.numPages ?? "?"}: ${fileName}`}
            className="block"
          />
          <div ref={textRef} className="pdf-textlayer" />
          {selected && (
            <div
              key={selectedId}
              aria-hidden="true"
              className="pdf-marks pointer-events-none absolute inset-0 z-[2]"
            >
              {selected.areas.map((box, index) => (
                <span key={`area-${index}`} className="pdf-mark-area" style={box} />
              ))}
              {selected.labels.map((box, index) => (
                <span key={`label-${index}`} className="pdf-mark" style={box} />
              ))}
            </div>
          )}
          {targets.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[3]">
              {targets.map(([id, box]) => {
                const title = titles.get(id) || "pole bez tytułu";
                return (
                  // One field can have several boxes (label and the space to write in); hovering any of them outlines all.
                  <span key={id} className="group contents">
                    {[...box.labels, ...box.areas].map((rect, index) => (
                      <button
                        key={index}
                        type="button"
                        tabIndex={index === 0 ? 0 : -1}
                        aria-hidden={index === 0 ? undefined : true}
                        aria-label={index === 0 ? `Zaznacz pole „${title}”` : undefined}
                        aria-pressed={index === 0 ? id === selectedId : undefined}
                        title={title}
                        onClick={() => onSelect(id)}
                        style={rect}
                        className="pointer-events-auto absolute cursor-pointer rounded-[3px] outline-offset-1 group-hover:bg-amber-300/20 group-hover:outline-2 group-hover:outline-amber-500 group-hover:outline-dashed focus-visible:bg-amber-300/20 focus-visible:outline-2 focus-visible:outline-ring"
                      />
                    ))}
                  </span>
                );
              })}
            </div>
          )}
          {busy && (
            <div
              className="absolute inset-0 flex min-h-48 min-w-48 flex-col items-center justify-center gap-3 bg-white/60 text-sm text-muted-foreground"
              role="status"
            >
              <span className="loader" aria-hidden="true" />
              Wczytywanie strony…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
