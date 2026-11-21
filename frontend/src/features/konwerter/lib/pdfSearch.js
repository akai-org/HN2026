// Szukanie etykiety pola w tekście PDF-a, żeby podświetlić je na oryginale.
// Backend nie zwraca położenia pól, więc dopasowujemy tekst: najpierw całą frazę,
// potem pojedyncze słowa z tolerancją odmiany („Kwota” ≈ „Kwotę”).

/** Tekst bez wielkości liter, polskich znaków i interpunkcji: „Imię/Nazwa” → „imie nazwa”. */
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Te same słowa albo ta sama „rdzeń” (co najmniej 4 znaki), np. kwota ↔ kwote, imie ↔ imienia. */
export function sameWord(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const length = Math.max(4, Math.min(a.length, b.length) - 1);
  return a.slice(0, length) === b.slice(0, length);
}

const STOP_WORDS = new Set(["i", "w", "z", "o", "na", "do", "od", "lub", "oraz", "dla", "jest", "sie", "the"]);
// Słowa zbyt ogólne, żeby samodzielnie wskazać pole („Numer budynku” to nie „Numer PESEL”).
const WEAK_WORDS = new Set([
  "numer", "kod", "adres", "nazwa", "dane", "plik", "wybierz", "informacje", "potwierdzenie", "czy", "jako", "kto",
  "twoje", "twoj", "innej", "osoby", "data", "miejsce", "pole", "wniosek", "wniosku",
]);

function significantWords(text) {
  return normalize(text)
    .split(" ")
    .filter((word) => word && !STOP_WORDS.has(word) && (word.length >= 3 || /\d/.test(word)));
}

/**
 * pages: [{ items: string[] }] — teksty kolejnych fragmentów strony (jak textContent.items[].str w pdf.js).
 * Zwraca { page (od 1), indices: number[], exact: boolean } albo null.
 */
export function findText(pages, query) {
  const phrase = normalize(query);
  if (phrase.length < 2) return null;

  // 1) Cała fraza (jako osobne słowa) w tekście strony, także rozbita na kilka fragmentów.
  //    Trafienie w długim akapicie (np. przypisie) zostaje w odwodzie: krótka etykieta jest lepsza.
  let paragraphMatch = null;
  for (let p = 0; p < pages.length; p += 1) {
    const ranges = [];
    let text = "";
    pages[p].items.forEach((item, index) => {
      const part = normalize(item);
      if (!part) return;
      if (text) text += " ";
      ranges.push({ index, start: text.length, end: text.length + part.length });
      text += part;
    });
    const match = new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?= |$)`).exec(text);
    if (match) {
      const start = match.index + match[1].length;
      const end = start + phrase.length;
      const indices = ranges.filter((range) => range.end > start && range.start < end).map((range) => range.index);
      const length = indices.reduce((sum, index) => sum + significantWords(pages[p].items[index]).length, 0);
      if (indices.length && length <= 8) return { page: p + 1, indices, exact: true };
      if (indices.length && !paragraphMatch) paragraphMatch = { page: p + 1, indices, exact: true };
    }
  }

  // 2) Najlepiej pasujący pojedynczy fragment według wspólnych słów. Musi trafić co najmniej
  //    jedno słowo znaczące; dokładne słowo liczy się mocniej niż odmienione.
  const words = significantWords(query);
  const strong = words.filter((word) => !WEAK_WORDS.has(word));
  if (strong.length === 0) return paragraphMatch;
  let best = null;
  pages.forEach(({ items }, p) => {
    items.forEach((item, index) => {
      const itemWords = significantWords(item);
      if (itemWords.length === 0) return;
      const weight = (word) => (itemWords.includes(word) ? 1 : itemWords.some((candidate) => sameWord(word, candidate)) ? 0.8 : 0);
      const strongHits = strong.reduce((sum, word) => sum + weight(word), 0);
      if (strongHits === 0) return;
      const weakHits = words.length - strong.length > 0 ? words.filter((word) => WEAK_WORDS.has(word)).reduce((sum, word) => sum + weight(word), 0) : 0;
      // Krótka etykieta wygrywa z akapitem, który zawiera te same słowa (np. przypis o PESEL-u).
      const extraWords = Math.max(0, itemWords.length - words.length);
      const score = strongHits / strong.length - extraWords * 0.02 + weakHits * 0.01;
      if (!best || score > best.score) best = { page: p + 1, indices: [index], exact: false, score };
    });
  });
  const threshold = strong.length === 1 ? 0.7 : 0.45;
  if (!best || best.score < threshold) return paragraphMatch;
  return { page: best.page, indices: best.indices, exact: false };
}
