// Łączenie kilku plików (PDF-y i zdjęcia stron) w jeden PDF przed wysłaniem do API.
// Backend przyjmuje jeden plik na żądanie, a jeden formularz bywa sfotografowany strona po stronie.
import { sniffImage } from "./files.js";
import { safeFileName } from "./text.js";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 18;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("Przerwano", "AbortError");
}

/** Strona A4 (pionowa albo pozioma, zależnie od proporcji zdjęcia) z obrazem wpasowanym w marginesy. */
function addImagePage(doc, image) {
  const landscape = image.width > image.height;
  const page = doc.addPage(landscape ? [A4.height, A4.width] : [A4.width, A4.height]);
  const { width, height } = page.getSize();
  const scale = Math.min((width - 2 * MARGIN) / image.width, (height - 2 * MARGIN) / image.height, 1.5);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
}

/**
 * @param {File[]} files pliki PDF, JPG i PNG w kolejności stron
 * @param {{ name: string, signal?: AbortSignal }} options
 * @returns {Promise<File>} jeden plik PDF
 */
export async function mergeToPdf(files, { name, signal } = {}) {
  // pdf-lib ładujemy dopiero przy pierwszym łączeniu, żeby nie spowalniać otwarcia strony.
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(name || "Formularz");
  doc.setCreator("Konwerter formularzy");
  doc.setLanguage?.("pl-PL");

  for (const file of files) {
    throwIfAborted(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageType = sniffImage(bytes);
    if (imageType === "jpeg") {
      addImagePage(doc, await doc.embedJpg(bytes));
    } else if (imageType === "png") {
      addImagePage(doc, await doc.embedPng(bytes));
    } else {
      let source;
      try {
        source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(`Nie udało się odczytać pliku „${file.name}”. Sprawdź, czy to poprawny PDF albo zdjęcie.`);
      }
      const pages = await doc.copyPages(source, source.getPageIndices());
      pages.forEach((page) => doc.addPage(page));
    }
  }

  throwIfAborted(signal);
  const data = await doc.save();
  return new File([data], `${safeFileName(name)}.pdf`, { type: "application/pdf", lastModified: Date.now() });
}
