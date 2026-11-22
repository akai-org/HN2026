// Lazy loading of pdf.js (Apache-2.0): the library and its worker are separate chunks,
// downloaded only when the first PDF original is shown.

let libraryPromise = null;

export function loadPdfjs() {
  libraryPromise ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return libraryPromise;
}

/** Opens a PDF from its bytes. Close it with closePdf(). */
export async function openPdf(data) {
  const lib = await loadPdfjs();
  return lib.getDocument({ data, isEvalSupported: false }).promise;
}

/** Closes the document and frees the worker (in pdf.js 6 the loading task does that, not the document). */
export function closePdf(doc) {
  if (!doc) return;
  if (doc.loadingTask?.destroy) doc.loadingTask.destroy();
  else doc.destroy?.();
}
