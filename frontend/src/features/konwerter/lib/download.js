// Pobieranie plików i kopiowanie do schowka.
import { safeFileName } from "./text.js";

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Zapisuje definicję formularza jako plik .json do importu w COI. */
export function downloadJson(text, title) {
  const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `${safeFileName(title)}.json`);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Starsze przeglądarki i strony bez HTTPS.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Nie udało się skopiować");
}
