// Drobne funkcje tekstowe wspólne dla całego konwertera.

/** Polska odmiana liczebnika: plural(5, ["plik", "pliki", "plików"]) → "plików". */
export function plural(count, [one, few, many]) {
  if (count === 1) return one;
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

/** „3 pliki”, „1 formularz”, „12 pól”. */
export function count(n, forms) {
  return `${n} ${plural(n, forms)}`;
}

export const FORMS = {
  file: ["plik", "pliki", "plików"],
  form: ["formularz", "formularze", "formularzy"],
  field: ["pole", "pola", "pól"],
  page: ["strona", "strony", "stron"],
  condition: ["warunek", "warunki", "warunków"],
  issue: ["uwaga", "uwagi", "uwag"],
};

/** Rozmiar pliku po polsku: „840 KB”, „2,4 MB”. */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Nazwa pliku bez rozszerzenia: „skan_str1.jpg” → „skan_str1”. */
export function baseName(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Bezpieczna nazwa pliku do pobrania: bez znaków zabronionych w systemach plików. */
export function safeFileName(name, fallback = "formularz") {
  const cleaned = String(name ?? "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|;%$']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Czas trwania w sekundach po polsku: „8 s”, „1 min 5 s”. */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
