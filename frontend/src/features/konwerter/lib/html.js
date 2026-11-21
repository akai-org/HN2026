// Opisy pól w COI są w HTML-u (np. "<html><head></head><body><p>…</p></body></html>").
// Pokazujemy je w podglądzie, więc najpierw czyścimy: JSON może pochodzić z modelu językowego
// albo z pliku wczytanego przez użytkownika.
import DOMPurify from "dompurify";

const CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "span", "img", "h3", "h4"],
  ALLOWED_ATTR: ["href", "title", "aria-label", "target", "rel", "src", "alt"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|svg\+xml);base64,)/i,
};

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      if (!node.getAttribute("href")) node.removeAttribute("target");
    }
    if (node.tagName === "IMG") {
      // Ikonki „link zewnętrzny” z materiałów COI są dekoracyjne.
      if (!node.getAttribute("alt")) node.setAttribute("alt", "");
      node.setAttribute("aria-hidden", "true");
    }
  });
}

/** Bezpieczny HTML do wstawienia w podglądzie (pusty tekst dla pustego dokumentu). */
export function sanitizeHtml(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  ensureHooks();
  const clean = DOMPurify.sanitize(html, CONFIG).trim();
  return clean.replace(/<p>\s*<\/p>/g, "").trim();
}

/** Sam tekst z HTML-a (do opisów w drzewie i podpowiedziach). */
export function htmlToText(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  const clean = sanitizeHtml(html);
  if (!clean) return "";
  const doc = new DOMParser().parseFromString(`<div>${clean}</div>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
