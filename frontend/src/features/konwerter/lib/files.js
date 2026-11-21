// Rodzaje plików i walidacja po stronie przeglądarki.
// Reguły są takie same jak w backendzie (src/hacknation_2026/ingest/validation.py i config.py),
// żeby urzędnik dowiedział się o błędzie od razu, a nie po wysłaniu pliku.
import { formatSize } from "./text.js";

const envLimit = Number(import.meta.env?.VITE_MAX_FILE_SIZE_MB);
/** Limit rozmiaru jednego pliku w MB. Domyślnie jak w backendzie (MAX_FILE_SIZE_MB = 10). */
export const MAX_FILE_SIZE_MB = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 10;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 250;
export const FORBIDDEN_FILENAME_CHARS = [";", ":", ">", "<", "\\", "/", "|", "'", "*", "%", "$"];

/**
 * kind: pdf | image | word | sheet.
 * mergeable: czy plik można połączyć z innymi w jeden PDF (strony jednego formularza).
 */
const PDF = { kind: "pdf", label: "PDF", badge: "PDF", tone: "red", mergeable: true };
const WORD = { kind: "word", label: "Word", badge: "DOC", tone: "blue", mergeable: false };
const EXCEL = { kind: "sheet", label: "Excel", badge: "XLSX", tone: "green", mergeable: false };
const ODS = { kind: "sheet", label: "OpenDocument", badge: "ODS", tone: "teal", mergeable: false };
const JPG = { kind: "image", label: "Zdjęcie JPG", badge: "JPG", tone: "violet", mergeable: true };
const PNG = { kind: "image", label: "Obraz PNG", badge: "PNG", tone: "violet", mergeable: true };

export const FILE_TYPES = {
  pdf: PDF,
  doc: { ...WORD, badge: "DOC" },
  docx: { ...WORD, badge: "DOCX" },
  xlsx: EXCEL,
  ods: ODS,
  jpg: JPG,
  jpeg: JPG,
  png: PNG,
};

export const ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const FORMAT_SUMMARY = "PDF, Word, Excel, OpenDocument albo zdjęcie (JPG, PNG)";

export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Opis rodzaju pliku albo undefined, gdy format nie jest obsługiwany. */
export function fileTypeOf(name) {
  return FILE_TYPES[extensionOf(name)];
}

function isSameFile(a, b) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/** Zwraca powód odrzucenia pliku (zdanie po polsku) albo null, gdy plik można dodać. */
export function rejectionReason(file, existingFiles = []) {
  const extension = extensionOf(file.name);
  if (!FILE_TYPES[extension]) {
    return extension ? `nieobsługiwany format .${extension}` : "brak rozszerzenia pliku";
  }
  if (file.size === 0) return "plik jest pusty";
  if (file.size > MAX_FILE_SIZE) {
    return `ma ${formatSize(file.size)}, a limit to ${MAX_FILE_SIZE_MB} MB`;
  }
  if (file.name.length > MAX_FILENAME_LENGTH) {
    return `nazwa jest dłuższa niż ${MAX_FILENAME_LENGTH} znaków`;
  }
  const forbidden = FORBIDDEN_FILENAME_CHARS.filter((char) => file.name.includes(char));
  if (forbidden.length > 0) {
    return `nazwa zawiera niedozwolone znaki: ${forbidden.join(" ")}`;
  }
  if (existingFiles.some((existing) => isSameFile(existing, file))) {
    return "ten plik jest już na liście";
  }
  return null;
}

/**
 * Dzieli przychodzące pliki na przyjęte i odrzucone.
 * entries: [{ file, folder }] — folder to ścieżka katalogu, z którego pochodzi plik ("" dla luźnych plików).
 */
export function partitionFiles(entries, knownFiles) {
  const accepted = [];
  const rejected = [];
  for (const entry of entries) {
    const reason = rejectionReason(entry.file, [...knownFiles, ...accepted.map((a) => a.file)]);
    if (reason) rejected.push({ name: entry.file.name, reason });
    else accepted.push(entry);
  }
  return { accepted, rejected };
}

/** Typ obrazu po pierwszych bajtach (nie po rozszerzeniu): "jpeg" | "png" | null. */
export function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}
