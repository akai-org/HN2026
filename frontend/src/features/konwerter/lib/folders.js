// Odczyt plików z folderów: przeciągniętych na stronę albo wybranych przyciskiem „Dodaj folder”.
// Wynik zawsze ma postać [{ file, folder }], gdzie folder to ścieżka katalogu ("" dla luźnych plików).

const IGNORED_NAMES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);
/** Bezpiecznik na wypadek przeciągnięcia całego dysku. */
export const MAX_FILES_PER_ADD = 300;

function isIgnored(name) {
  return name.startsWith(".") || IGNORED_NAMES.has(name.toLowerCase());
}

function dirname(path) {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

/** Pliki z <input type="file"> (także z atrybutem webkitdirectory). */
export function entriesFromFileList(fileList) {
  const entries = Array.from(fileList ?? [])
    .filter((file) => !isIgnored(file.name))
    .map((file) => ({ file, folder: dirname(file.webkitRelativePath || "") }));
  // Przeglądarka podaje pliki folderu w dowolnej kolejności; strony układamy jak w eksploratorze (str2 przed str10).
  if (entries.some((entry) => entry.folder)) {
    entries.sort((a, b) => a.folder.localeCompare(b.folder, "pl", { numeric: true }) || a.file.name.localeCompare(b.file.name, "pl", { numeric: true }));
  }
  return entries;
}

/**
 * Część synchroniczna: wpisy trzeba pobrać jeszcze w trakcie zdarzenia `drop`,
 * bo później przeglądarka czyści DataTransfer.
 */
export function collectDropEntries(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  const files = Array.from(dataTransfer?.files ?? []);
  return { entries, files };
}

function readFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readBatch(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walk(entry, parent, out) {
  if (out.length >= MAX_FILES_PER_ADD || isIgnored(entry.name)) return;
  if (entry.isFile) {
    out.push({ file: await readFile(entry), folder: parent });
    return;
  }
  if (!entry.isDirectory) return;
  const path = parent ? `${parent}/${entry.name}` : entry.name;
  const reader = entry.createReader();
  // readEntries zwraca wyniki porcjami (w Chrome po 100), więc czytamy do pustej porcji.
  for (;;) {
    const batch = await readBatch(reader);
    if (batch.length === 0) break;
    const sorted = [...batch].sort((a, b) => a.name.localeCompare(b.name, "pl", { numeric: true }));
    for (const child of sorted) await walk(child, path, out);
  }
}

/** Część asynchroniczna: rozwija foldery. Bez wsparcia dla wpisów wraca do zwykłej listy plików. */
export async function readDropEntries({ entries, files }) {
  if (entries.length === 0) return { entries: entriesFromFileList(files), truncated: false };
  const out = [];
  for (const entry of entries) await walk(entry, "", out);
  return { entries: out, truncated: out.length >= MAX_FILES_PER_ADD };
}
