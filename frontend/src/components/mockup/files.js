import { FileImage, FileSpreadsheet, FileText } from "lucide-react";

export const STEPS = ["Dodaj formularz", "Rozpoznawanie", "Sprawdź i zatwierdź"];

// Zgodne z backendem: src/hacknation_2026/ingest/validation.py i config.py (max_file_size_mb = 10).
export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILENAME_LENGTH = 250;
const FORBIDDEN_FILENAME_CHARS = [";", ":", ">", "<", "\\", "/", "|", "'", "*", "%", "$"];

const PDF = { label: "PDF", icon: FileText, tone: "bg-red-50 text-red-600 ring-red-100" };
const WORD = { label: "Word", icon: FileText, tone: "bg-blue-50 text-blue-600 ring-blue-100" };
const EXCEL = { label: "Excel", icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" };
const ODS = { label: "ODS", icon: FileSpreadsheet, tone: "bg-teal-50 text-teal-600 ring-teal-100" };
const IMAGE = { icon: FileImage, tone: "bg-violet-50 text-violet-600 ring-violet-100", isImage: true };

export const FILE_TYPES = {
  pdf: PDF,
  doc: WORD,
  docx: WORD,
  xlsx: EXCEL,
  ods: ODS,
  jpg: { ...IMAGE, label: "JPG" },
  jpeg: { ...IMAGE, label: "JPG" },
  png: { ...IMAGE, label: "PNG" },
};

export const FORMAT_CHIPS = [PDF, WORD, EXCEL, ODS, { ...IMAGE, label: "JPG" }, { ...IMAGE, label: "PNG" }];

export const ACCEPT = Object.keys(FILE_TYPES).map((ext) => `.${ext}`).join(",");

export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileTypeOf(file) {
  return FILE_TYPES[extensionOf(file.name)];
}

function isSameFile(a, b) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/** Zwraca powód odrzucenia pliku albo null, gdy plik można dodać. */
export function rejectionReason(file, existingFiles) {
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

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Polska odmiana: plural(5, ["plik", "pliki", "plików"]) → "plików". */
export function plural(count, [one, few, many]) {
  if (count === 1) return one;
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

export function countQuestions(form) {
  return (form?.tabs ?? []).reduce((sum, tab) => sum + (tab.questions?.length ?? 0), 0);
}

export async function convertFile(file, signal) {
  const body = new FormData();
  body.append("file", file);

  let response;
  try {
    response = await fetch("/api/forms/convert", { method: "POST", body, signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Brak połączenia z serwerem. Sprawdź połączenie i spróbuj ponownie.");
  }

  if (!response.ok) {
    let message = `Nie udało się rozpoznać formularza (błąd ${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.message === "string" && data.message) message = data.message;
    } catch {
      // Serwer nie zwrócił JSON-a: zostaje komunikat domyślny.
    }
    throw new Error(message);
  }

  return response.json();
}
