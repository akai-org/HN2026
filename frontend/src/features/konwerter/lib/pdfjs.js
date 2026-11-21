// Leniwe ładowanie pdf.js (Apache-2.0): biblioteka i worker trafiają do osobnych plików
// i pobierają się dopiero przy pierwszym podglądzie PDF-a.

let libraryPromise = null;

export function loadPdfjs() {
  libraryPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return libraryPromise;
}

/** Zamyka dokument i zwalnia worker (w pdf.js 6 robi to zadanie ładowania, a nie sam dokument). */
export function closePdf(doc) {
  if (!doc) return;
  if (doc.loadingTask?.destroy) doc.loadingTask.destroy();
  else doc.destroy?.();
}

/** Otwiera PDF z adresu (blob:/http) albo z bajtów. Dokument zamyka się przez closePdf(). */
export async function openPdf(source) {
  const lib = await loadPdfjs();
  const params = typeof source === "string" ? { url: source } : { data: source };
  return lib.getDocument({ ...params, isEvalSupported: false }).promise;
}

// Miniatury PDF-ów zapamiętujemy (klucz: plik), żeby nie renderować ich przy każdym przerysowaniu listy.
export const pdfThumbCache = new WeakMap();

/** Liczba stron PDF-a, jeśli miniatura już ją zna (do opisu pliku). */
export function cachedPdfPages(item) {
  return item.type?.kind === "pdf" ? pdfThumbCache.get(item.file)?.pages ?? null : null;
}

// Miniatury renderujemy po kolei (najwyżej dwie naraz), żeby przy setkach plików nie zablokować karty.
const queue = [];
let active = 0;

function pump() {
  while (active < 2 && queue.length > 0) {
    const job = queue.shift();
    active += 1;
    job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push(() => task().then(resolve, reject));
    pump();
  });
}

/** Miniatura pierwszej strony PDF-a jako data URL oraz liczba stron. */
export function pdfThumbnail(file, size = 112) {
  return schedule(async () => {
    const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = size / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale: scale * 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
      return { url: canvas.toDataURL("image/png"), pages: doc.numPages };
    } finally {
      closePdf(doc);
    }
  });
}
