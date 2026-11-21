// Roboczy dokument JSON jednego formularza na ekranie sprawdzania.
// Tekst JSON jest źródłem prawdy (to on trafi do COI), a `form` to ostatnia poprawna wersja,
// z której rysujemy podgląd. Gdy urzędnik wpisze błędny JSON, podgląd zostaje na ostatniej
// poprawnej wersji, a błąd pokazujemy obok.
import { parseJson } from "./jsonPositions.js";

const HISTORY_LIMIT = 60;
/** Zmiany wpisywane w edytorze w odstępie krótszym niż to łączymy w jeden krok cofania. */
const COALESCE_MS = 1200;

export function stringifyForm(form) {
  return JSON.stringify(form, null, 2);
}

export function createDoc(form) {
  return { text: stringifyForm(form), form, error: null, past: [], future: [], lastSource: "init", lastAt: 0 };
}

function pushPast(doc) {
  return [...doc.past, doc.text].slice(-HISTORY_LIMIT);
}

/** Zmiana z edytora JSON. */
export function applyText(doc, text, at = Date.now()) {
  if (text === doc.text) return doc;
  const parsed = parseJson(text);
  const coalesce = doc.lastSource === "text" && at - doc.lastAt < COALESCE_MS;
  return {
    ...doc,
    text,
    form: parsed.error ? doc.form : parsed.value,
    error: parsed.error,
    past: coalesce ? doc.past : pushPast(doc),
    future: [],
    lastSource: "text",
    lastAt: at,
  };
}

/** Zmiana z podglądu (np. zmiana etykiety): przepisujemy cały JSON. */
export function applyForm(doc, form, at = Date.now()) {
  const text = stringifyForm(form);
  if (text === doc.text) return doc;
  return { ...doc, text, form, error: null, past: pushPast(doc), future: [], lastSource: "form", lastAt: at };
}

function restore(doc, text, past, future) {
  const parsed = parseJson(text);
  return { ...doc, text, form: parsed.error ? doc.form : parsed.value, error: parsed.error, past, future, lastSource: "history", lastAt: 0 };
}

export function undo(doc) {
  if (doc.past.length === 0) return doc;
  const text = doc.past[doc.past.length - 1];
  return restore(doc, text, doc.past.slice(0, -1), [doc.text, ...doc.future].slice(0, HISTORY_LIMIT));
}

export function redo(doc) {
  if (doc.future.length === 0) return doc;
  const [text, ...future] = doc.future;
  return restore(doc, text, pushPast(doc), future);
}
