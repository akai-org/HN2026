// Dopasowanie pól formularza do napisów na oryginale PDF.
//
// Backend nie zwraca położenia pól na papierze, więc szukamy etykiet w warstwie tekstu PDF-a.
// Samo „czy słowo występuje” myli się na typowych wnioskach (ten sam wyraz w tytule, przypisie
// i w klauzuli RODO), dlatego dopasowanie bierze pod uwagę:
//  1. słowa z odmianą („kwota” ≈ „w kwocie”, „podatek” ≈ „podatku”) i skróty („nr” = „numer”),
//  2. to, czy napis wygląda na etykietę (dwukropek, miejsce do wpisania, podpis w nawiasie),
//     a nie na nagłówek albo akapit,
//  3. kontekst sekcji („Ulica” w sekcji „Lokalizacja budynku” szuka słowa „budynek” w pobliżu),
//  4. kolejność pól w formularzu: pola z jednej sekcji leżą zwykle obok siebie na papierze.
// Brak pewnego dopasowania = brak zaznaczenia. Lepiej nic nie wskazać, niż wskazać złe miejsce.

// ---------------------------------------------------------------------------------------------
// Słowa

/** Litera bez wielkości liter i znaków diakrytycznych: „Ł” → „l”, „ę” → „e”. */
function foldChar(char) {
  const lower = char.toLowerCase();
  if (lower === "ł") return "l";
  return lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const WORD_CHAR = /^[a-z0-9]+$/;

/** Słowa tekstu z położeniem w oryginale: [{ word, start, end }]. „e-mail” to jedno słowo. */
export function tokenize(text) {
  const source = String(text ?? "");
  const tokens = [];
  let current = null;
  for (let index = 0; index < source.length; index += 1) {
    const folded = foldChar(source[index]);
    if (folded && WORD_CHAR.test(folded)) {
      if (current) {
        current.word += folded;
        current.end = index + 1;
      } else {
        current = { word: folded, start: index, end: index + 1 };
      }
    } else if (current) {
      tokens.push(current);
      current = null;
    }
  }
  if (current) tokens.push(current);
  // „e-mail” / „e mail” → „email”
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    if (tokens[index].word === "e" && tokens[index + 1].word === "mail") {
      tokens.splice(index, 2, { word: "email", start: tokens[index].start, end: tokens[index + 1].end });
    }
  }
  return tokens;
}

/** Tekst bez wielkości liter, polskich znaków i interpunkcji: „Imię/Nazwa” → „imie nazwa”. */
export function normalize(text) {
  return tokenize(text)
    .map((token) => token.word)
    .join(" ");
}

// Typowe skróty na drukach urzędowych.
const ABBREVIATIONS = new Map([
  ["nr", "numer"],
  ["ul", "ulica"],
  ["tel", "telefon"],
  ["al", "aleja"],
  ["os", "osiedle"],
  ["mail", "email"],
]);

// Słowa bez znaczenia dla dopasowania: spójniki i zwroty z opisów pól w eUsługach („Wybierz, jako kto…”).
const STOP_WORDS = new Set([
  "a",
  "i",
  "w",
  "we",
  "z",
  "ze",
  "o",
  "u",
  "na",
  "do",
  "od",
  "po",
  "za",
  "przy",
  "lub",
  "albo",
  "oraz",
  "dla",
  "jest",
  "sa",
  "sie",
  "to",
  "ten",
  "ta",
  "te",
  "tego",
  "tej",
  "tym",
  "jak",
  "jako",
  "kto",
  "co",
  "czy",
  "czyim",
  "ktory",
  "ktora",
  "ktore",
  "ktorego",
  "ktorej",
  "ktorym",
  "ktorych",
  "jaki",
  "jaka",
  "jakie",
  "mamy",
  "zrobic",
  "wybierz",
  "podaj",
  "wpisz",
  "zaznacz",
  "dodaj",
  "twoje",
  "twoj",
  "twoja",
  "twoich",
  "twoim",
  "swoje",
  "swoj",
  "jestes",
  "dotyczy",
  "dotyczace",
  "skladany",
  "skladasz",
  "skladana",
  "plik",
  "pliki",
  "pliku",
  "plikiem",
  "the",
]);

// Słowa zbyt ogólne, żeby samodzielnie wskazać pole („Numer budynku” to nie „Numer PESEL”).
const WEAK_WORDS = new Set([
  "numer",
  "kod",
  "adres",
  "nazwa",
  "dane",
  "danych",
  "informacje",
  "informacja",
  "potwierdzenie",
  "potwierdzeniem",
  "innej",
  "osoby",
  "osoba",
  "data",
  "miejsce",
  "pole",
  "wniosek",
  "wniosku",
  "dokument",
  "rodzaj",
]);

// Końcówki fleksyjne od najdłuższych. Rdzeń musi mieć co najmniej 3 litery.
const SUFFIXES = [
  "owego",
  "owemu",
  "owych",
  "owymi",
  "owiec",
  "ania",
  "enia",
  "aniu",
  "eniu",
  "anie",
  "enie",
  "owej",
  "owym",
  "owie",
  "ami",
  "ach",
  "ego",
  "emu",
  "ych",
  "ymi",
  "imi",
  "ich",
  "owa",
  "owe",
  "owy",
  "owi",
  "iem",
  "iej",
  "ow",
  "om",
  "em",
  "ie",
  "iu",
  "ia",
  "ii",
  "ej",
  "ym",
  "im",
  "ac",
  "ic",
  "yc",
  "a",
  "e",
  "i",
  "o",
  "u",
  "y",
];

/** Bardzo prosty rdzeń polskiego słowa: odcina końcówkę i ujednolica oboczności (kwocie → kwot). */
export function stem(word) {
  if (word.length < 4 || /\d/.test(word)) return word;
  let base = word;
  for (const suffix of SUFFIXES) {
    if (base.endsWith(suffix) && base.length - suffix.length >= 3) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  // e ruchome: podatek → podatk (jak w „podatku”), budynek → budynk
  if (/[^aeiouy]ek$/.test(base) && base.length >= 5) base = `${base.slice(0, -2)}k`;
  // oboczności spółgłosek na końcu rdzenia: kwoc(ie) → kwot(a), wodz(ie) → wod(a), gorz(e) → gor(a)
  if (base.endsWith("dz")) base = base.slice(0, -1);
  else if (base.endsWith("rz")) base = base.slice(0, -1);
  else if (/[^sc]c$/.test(base)) base = `${base.slice(0, -1)}t`;
  return base;
}

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/** Rdzenie różnią się tylko jedną samogłoską (oboczność ą/ę: urząd → urzędu). */
function vowelAlternation(a, b) {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (!VOWELS.has(a[i]) || !VOWELS.has(b[i])) return false;
    differences += 1;
  }
  return differences === 1;
}

function term(word) {
  const full = ABBREVIATIONS.get(word) ?? word;
  return { word: full, stem: stem(full) };
}

/**
 * Podobieństwo dwóch słów (0–1): to samo słowo 1, ten sam rdzeń 0,9,
 * rdzeń będący początkiem drugiego albo różniący się jedną samogłoską (urząd/urzędu) 0,7.
 */
export function wordSimilarity(a, b) {
  const x = typeof a === "string" ? term(a) : a;
  const y = typeof b === "string" ? term(b) : b;
  if (x.word === y.word) return 1;
  if (x.word.length < 3 || y.word.length < 3) return 0;
  if (x.stem === y.stem) return 0.9;
  const [short, long] = x.stem.length <= y.stem.length ? [x.stem, y.stem] : [y.stem, x.stem];
  if (short.length >= 3 && long.startsWith(short) && long.length - short.length <= 2) return 0.7;
  if (short.length >= 4 && vowelAlternation(short, long)) return 0.7;
  return 0;
}

/** Zgodność ze starszym API: czy to „to samo słowo” z dokładnością do odmiany. */
export function sameWord(a, b) {
  return wordSimilarity(a, b) >= 0.7;
}

// ---------------------------------------------------------------------------------------------
// Indeks tekstu PDF-a

const FILLER_RUN = /[._…_\-–—]{3,}/;
const ONLY_FILLER = /^[\s.…_\-–—*:()/]*$/;

/**
 * pages: [{ items: Array<string | { str, height? }> }] — fragmenty tekstu każdej strony w kolejności
 * z pdf.js (textContent.items z polem `str`). Indeksy fragmentów odpowiadają textDivs warstwy tekstu.
 */
export function createPdfIndex(pages) {
  const indexed = (pages ?? []).map((page) => {
    const raw = (page?.items ?? []).map((item) =>
      typeof item === "string" ? { str: item } : { str: item?.str ?? "", height: item?.height },
    );
    const heights = raw
      .filter((item) => item.height > 0 && /[a-zA-Z]{2}/.test(item.str))
      .map((item) => item.height)
      .sort((a, b) => a - b);
    const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
    const items = raw.map((item) => {
      const tokens = tokenize(item.str);
      const content = tokens.filter((token) => !STOP_WORDS.has(token.word) && !/^\d+$/.test(token.word));
      const text = item.str.trim();
      const letters = item.str.replace(/[^\p{L}]/gu, "");
      return {
        str: item.str,
        tokens,
        words: content.length,
        filler: Boolean(text) && tokens.length === 0 && ONLY_FILLER.test(text) && text.length >= 3,
        hasInput: FILLER_RUN.test(item.str),
        colon: /[:*]\s*$/.test(text),
        caption: /^\(.*\)$/.test(text),
        heading:
          (medianHeight > 0 && item.height > medianHeight * 1.3 && content.length <= 8) ||
          (letters.length >= 6 && letters === letters.toUpperCase() && content.length <= 8),
      };
    });
    items.forEach((item, index) => {
      // Etykieta, po której jest miejsce do wpisania (kropki w następnym fragmencie).
      const next = items.slice(index + 1).find((candidate) => candidate.str.trim());
      item.label =
        item.colon ||
        item.caption ||
        item.hasInput ||
        Boolean(next?.filler || (next && /^\s*\*/.test(next.str)));
      // Akapit: dużo słów i brak miejsca do wpisania (przypisy, klauzula informacyjna).
      item.prose = item.words >= 8 && !item.hasInput;
    });
    const tokens = [];
    let order = 0;
    items.forEach((item, itemIndex) => {
      if (item.tokens.length) order += 1;
      item.order = order;
      item.tokens.forEach((token) => {
        // „ul. Browarna 85”, „nr 12” to wpisana wartość (np. adres urzędu), a nie etykieta pola.
        const value = ABBREVIATIONS.has(token.word) && /^\.?\s*[\p{Lu}\d]/u.test(item.str.slice(token.end));
        tokens.push({
          ...term(token.word),
          raw: token.word,
          item: itemIndex,
          start: token.start,
          end: token.end,
          stop: STOP_WORDS.has(token.word) || value,
        });
      });
    });
    // Strona z samymi akapitami (np. klauzula informacyjna RODO) nie zawiera rubryk do wypełnienia.
    const withText = items.filter((item) => item.words > 0);
    const informational =
      withText.length > 0 && withText.filter((item) => item.prose).length / withText.length > 0.5;
    return { items, tokens, informational };
  });
  return { pages: indexed, empty: indexed.every((page) => page.tokens.length === 0) };
}

// ---------------------------------------------------------------------------------------------
// Szukanie jednej etykiety

function queryTerms(text) {
  const seen = new Set();
  return tokenize(text)
    .map((token) => term(token.word))
    .filter((entry) => {
      if (STOP_WORDS.has(entry.word) || seen.has(entry.word)) return false;
      if (entry.word.length < 2 && !/\d/.test(entry.word)) return false;
      seen.add(entry.word);
      return true;
    })
    .map((entry) => ({
      ...entry,
      strong: !WEAK_WORDS.has(entry.word),
      weight: WEAK_WORDS.has(entry.word) ? 0.4 : 1,
    }));
}

const MIN_SCORE = 0.45;

/**
 * Kandydaci na miejsce etykiety: okna kolejnych słów (także z kilku fragmentów w linii),
 * w których występują słowa zapytania. Zwraca listę od najlepszego.
 */
function findCandidates(index, text, { excluded = null, group = false, limit = 6 } = {}) {
  const terms = queryTerms(text);
  if (!terms.length) return [];
  const totalWeight = terms.reduce((sum, entry) => sum + entry.weight, 0);
  const strongCount = terms.filter((entry) => entry.strong).length;
  const maxSpan = terms.length * 2 + 3;
  const found = new Map();

  index.pages.forEach((page, pageIndex) => {
    const { tokens, items } = page;
    const matches = tokens.map((token, tokenIndex) => {
      if (token.stop || excluded?.has(`${pageIndex}:${tokenIndex}`)) return null;
      const list = [];
      terms.forEach((entry, termIndex) => {
        const similarity = wordSimilarity(token, entry);
        if (similarity > 0) list.push({ termIndex, similarity });
      });
      return list.length ? list : null;
    });

    for (let start = 0; start < tokens.length; start += 1) {
      if (!matches[start]) continue;
      let spanWords = 0;
      for (let end = start; end < tokens.length && end - start < maxSpan * 2; end += 1) {
        if (items[tokens[end].item].order - items[tokens[start].item].order > 2) break;
        // Etykieta nie przechodzi przez dwukropek („Uzasadnienie:”) ani przez linię z kropkami.
        if (end > start && tokens[end].item !== tokens[end - 1].item) {
          const left = tokens[end - 1].item;
          if (items[left].colon) break;
          if (items.slice(left + 1, tokens[end].item).some((item) => item.filler)) break;
        }
        if (!tokens[end].stop) spanWords += 1;
        if (spanWords > maxSpan) break;
        if (!matches[end]) continue;

        // Każde słowo zapytania i każde słowo z PDF-a liczymy najwyżej raz (najpierw najlepsze pary).
        const pairs = [];
        for (let position = start; position <= end; position += 1) {
          (matches[position] ?? []).forEach((match) => pairs.push({ ...match, position }));
        }
        pairs.sort((a, b) => b.similarity - a.similarity || a.position - b.position);
        const usedTerms = new Map();
        const usedTokens = new Set();
        for (const pair of pairs) {
          if (usedTerms.has(pair.termIndex) || usedTokens.has(pair.position)) continue;
          usedTerms.set(pair.termIndex, pair);
          usedTokens.add(pair.position);
        }
        // Okno ma zaczynać się i kończyć dopasowanym słowem.
        if (!usedTokens.has(start) || !usedTokens.has(end)) continue;

        let recallSum = 0;
        let strongHits = 0;
        usedTerms.forEach((pair, termIndex) => {
          recallSum += terms[termIndex].weight * pair.similarity;
          if (terms[termIndex].strong) strongHits += 1;
        });
        const recall = recallSum / totalWeight;
        if (strongCount === 0 && usedTerms.size < terms.length) continue;
        if (strongCount === 1 && strongHits < 1) continue;
        if (strongCount > 1 && strongHits < Math.ceil(strongCount / 2)) continue;
        if (recall < 0.5) continue;

        const precision = usedTokens.size / Math.max(1, spanWords);
        const ordered = [...usedTerms.entries()]
          .sort((a, b) => a[0] - b[0])
          .every(([, pair], i, list) => i === 0 || pair.position > list[i - 1][1].position);
        const covered = [...new Set(tokens.slice(start, end + 1).map((token) => token.item))].map(
          (itemIndex) => items[itemIndex],
        );
        const coverage =
          usedTokens.size /
          Math.max(
            1,
            covered.reduce((sum, item) => sum + item.words, 0),
          );
        const isLabel = covered.some((item) => item.label);
        const hasInput = covered.some((item) => item.hasInput || item.label);
        const isProse = covered.some((item) => item.prose);
        const isHeading = covered.some((item) => item.heading);

        let score = recall * (0.55 + 0.45 * precision);
        if (ordered && usedTerms.size > 1) score += 0.04;
        if (isLabel) score += 0.12;
        if (isProse) score -= 0.3;
        if (isHeading) score += group ? 0.05 : -0.2;
        if (page.informational) score -= 0.2;
        score -= (covered.length - 1) * 0.04;
        if (score < MIN_SCORE) continue;

        const positions = [...usedTokens].sort((a, b) => a - b);
        const key = `${pageIndex}:${positions.join(",")}`;
        const previous = found.get(key);
        if (!previous || previous.score < score) {
          // Słabe trafienie: tylko część nazwy pola i mała część dłuższego napisu. Wymaga potwierdzenia kontekstem.
          const weak = recall < 0.7 && coverage < 0.5;
          const itemIndexes = [...new Set(positions.map((token) => tokens[token].item))];
          found.set(key, {
            page: pageIndex,
            positions,
            items: itemIndexes,
            first: positions[0],
            last: positions[positions.length - 1],
            score,
            recall,
            weak,
            hasInput,
          });
        }
      }
    }
  });

  // Z nakładających się okien zostaje najlepsze.
  const sorted = [...found.values()].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of sorted) {
    const overlaps = kept.some(
      (other) =>
        other.page === candidate.page && other.first <= candidate.last && candidate.first <= other.last,
    );
    if (!overlaps) kept.push(candidate);
    if (kept.length >= limit) break;
  }
  return kept;
}

const PREPOSITIONS = new Set(["w", "we", "z", "ze", "o", "na", "do", "od", "po", "za", "przy", "u"]);

/**
 * Zakresy znaków do zaznaczenia: krótka etykieta cała, w dłuższym napisie tylko dopasowane słowa.
 * shared: fragmenty, w których są etykiety kilku pól („Imię i nazwisko”) — tam zawsze tylko własne słowa.
 */
function marksFor(index, candidate, shared = null) {
  const page = index.pages[candidate.page];
  const byItem = new Map();
  candidate.positions.forEach((position) => {
    const token = page.tokens[position];
    const list = byItem.get(token.item) ?? [];
    list.push(token);
    byItem.set(token.item, list);
  });
  return [...byItem.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([itemIndex, matched]) => {
      const item = page.items[itemIndex];
      const isShared = shared?.has(`${candidate.page}:${itemIndex}`);
      if (item.words <= 3 && !item.hasInput && !isShared && matched.length * 3 >= item.words) {
        return { item: itemIndex, start: item.tokens[0].start, end: item.tokens[item.tokens.length - 1].end };
      }
      // Osobne zaznaczenia dla słów rozdzielonych innymi słowami („adres … siedziba”).
      const runs = [];
      matched.sort((a, b) => a.start - b.start);
      matched.forEach((token) => {
        const run = runs[runs.length - 1];
        const between = run
          ? item.tokens.filter((t) => t.start >= run.end && t.end <= token.start && !STOP_WORDS.has(t.word))
          : [];
        if (run && between.length === 0) run.end = token.end;
        else runs.push({ item: itemIndex, start: token.start, end: token.end });
      });
      // Przyimek tuż przed etykietą należy do niej: „w kwocie”, „przy ulicy”, „w obrębie”.
      runs.forEach((run) => {
        const before = item.tokens.filter((t) => t.end <= run.start).at(-1);
        if (before && PREPOSITIONS.has(before.word) && /^\s+$/.test(item.str.slice(before.end, run.start)))
          run.start = before.start;
      });
      return runs;
    })
    .flat();
}

function toHit(index, candidate, shared) {
  return {
    page: candidate.page + 1,
    marks: marksFor(index, candidate, shared),
    score: Number(candidate.score.toFixed(3)),
  };
}

/** Najlepsze miejsce jednej etykiety bez kontekstu formularza. Zwraca { page (od 1), marks, score } albo null. */
export function findLabel(index, text) {
  const [best] = findCandidates(index, text).filter((candidate) => !candidate.weak);
  return best ? toHit(index, best) : null;
}

// ---------------------------------------------------------------------------------------------
// Dopasowanie całego formularza

/** Jak bardzo słowa z tytułów sekcji nadrzędnych występują w pobliżu kandydata (0–1). */
function contextScore(index, candidate, contexts) {
  if (!contexts.length) return 0;
  const tokens = index.pages[candidate.page].tokens;
  const nearby = [];
  for (
    let position = Math.max(0, candidate.first - 25);
    position <= Math.min(tokens.length - 1, candidate.last + 8);
    position += 1
  ) {
    if (!tokens[position].stop && !candidate.positions.includes(position)) nearby.push(tokens[position]);
  }
  let best = 0;
  contexts.forEach(({ text, weight }) => {
    const strong = queryTerms(text).filter((entry) => entry.strong);
    if (!strong.length) return;
    const hits = strong.filter((entry) => nearby.some((token) => wordSimilarity(token, entry) >= 0.7)).length;
    best = Math.max(best, (weight * hits) / strong.length);
  });
  return best;
}

const position = (candidate) => candidate.page * 1e6 + candidate.first;
const sameItem = (a, b) => a.page === b.page && a.items.some((item) => b.items.includes(item));

function transition(fromField, from, toField, to) {
  const overlap = from.page === to.page && from.positions.some((token) => to.positions.includes(token));
  if (overlap) return fromField.key === toField.key ? 0.1 : -0.3;
  const distance = position(to) - position(from);
  const siblings = fromField.parentId != null && fromField.parentId === toField.parentId;
  // Ten sam napis to wciąż ta sama rubryka („Imię i nazwisko” przy kolejności Nazwisko, Imię).
  if (distance >= 0 || sameItem(from, to)) {
    const near = distance < 1e6 ? Math.max(0, 1 - Math.abs(distance) / 80) : 0;
    return (siblings ? 0.25 : 0.15) * near;
  }
  return siblings ? -0.15 : -0.08;
}

/**
 * fields: [{ id, title, parentId?, group?: boolean }] w kolejności z formularza; parentId wskazuje sekcję.
 * options.title: tytuł formularza — jego wystąpienie na papierze (nagłówek) pomijamy przy szukaniu pól.
 * Zwraca Map(id → { page, marks: [{ item, start, end }], score }).
 */
export function matchFields(index, fields, { title = "" } = {}) {
  const result = new Map();
  if (!index || index.empty || !fields?.length) return result;

  const byId = new Map(fields.map((field) => [field.id, field]));
  const childrenOf = new Map();
  fields.forEach((field) => {
    if (field.parentId == null) return;
    const list = childrenOf.get(field.parentId) ?? [];
    list.push(field);
    childrenOf.set(field.parentId, list);
  });

  // Nagłówek dokumentu (tytuł wniosku) i zdania go powtarzające („Wnoszę o ustalenie numeru…”)
  // nie są etykietami pól. Zostawiamy powtórzenia z miejscem do wpisania („…nadpłaty z tytułu ……”).
  const excluded = new Set();
  const titles = title ? findCandidates(index, title, { group: true, limit: 4 }) : [];
  titles.forEach((candidate, rank) => {
    const isTitle = rank === 0 ? candidate.recall >= 0.7 : candidate.recall >= 0.55 && !candidate.hasInput;
    if (!isTitle) return;
    for (let token = candidate.first; token <= candidate.last; token += 1)
      excluded.add(`${candidate.page}:${token}`);
  });

  const ancestors = (field) => {
    const list = [];
    let parent = byId.get(field.parentId);
    let weight = 1;
    while (parent && list.length < 3) {
      if (parent.title) list.push({ text: parent.title, weight });
      weight *= 0.6;
      parent = byId.get(parent.parentId);
    }
    if (field.context) list.push({ text: field.context, weight: 0.5 });
    return list;
  };

  // Kandydaci dla pól (bez sekcji), z oceną kontekstu.
  const leaves = fields
    .filter((field) => !field.group && field.title?.trim())
    .map((field) => {
      const key = normalize(field.title);
      const contexts = ancestors(field);
      const candidates = findCandidates(index, field.title, { excluded })
        .map((candidate) => {
          const context = contextScore(index, candidate, contexts);
          return { ...candidate, context, total: candidate.score + 0.25 * context };
        })
        .filter((candidate) => !candidate.weak || candidate.context > 0);
      return { ...field, key, candidates };
    });

  // To samo pole w kilku sekcjach (np. „Ulica” w trzech adresach): miejsce dostaje tylko ta sekcja,
  // której kontekst najlepiej pasuje. Bez żadnego kontekstu — wszystkie (wspólna rubryka na papierze).
  const byKey = new Map();
  leaves.forEach((leaf) => byKey.set(leaf.key, [...(byKey.get(leaf.key) ?? []), leaf]));
  byKey.forEach((same) => {
    if (same.length < 2) return;
    const best = new Map();
    same.forEach((leaf) =>
      leaf.candidates.forEach((c) =>
        best.set(`${c.page}:${c.first}`, Math.max(best.get(`${c.page}:${c.first}`) ?? 0, c.context)),
      ),
    );
    same.forEach((leaf) => {
      leaf.candidates = leaf.candidates.filter(
        (c) => c.context >= (best.get(`${c.page}:${c.first}`) ?? 0) - 0.01,
      );
    });
  });

  // Wybór kandydatów z uwzględnieniem kolejności (programowanie dynamiczne po polach w kolejności formularza).
  const states = [{ value: 0, leaf: null, candidate: null, previous: -1 }];
  leaves.forEach((leaf) => {
    const added = [];
    leaf.candidates.forEach((candidate) => {
      let bestValue = -Infinity;
      let bestPrevious = 0;
      states.forEach((state, stateIndex) => {
        const value =
          state.value + (state.candidate ? transition(state.leaf, state.candidate, leaf, candidate) : 0);
        if (value > bestValue) {
          bestValue = value;
          bestPrevious = stateIndex;
        }
      });
      added.push({ value: bestValue + candidate.total, leaf, candidate, previous: bestPrevious });
    });
    states.push(...added);
  });
  let last = states.reduce(
    (best, state, stateIndex) => (state.value > states[best].value ? stateIndex : best),
    0,
  );
  const chosen = [];
  while (last > 0) {
    chosen.push(states[last]);
    last = states[last].previous;
  }
  const claims = new Map();
  chosen.forEach(({ leaf, candidate }) => {
    candidate.positions.forEach((token) => {
      const key = `${candidate.page}:${index.pages[candidate.page].tokens[token].item}`;
      claims.set(key, new Set([...(claims.get(key) ?? []), leaf.key]));
    });
  });
  const shared = new Set([...claims.entries()].filter(([, keys]) => keys.size > 1).map(([key]) => key));
  chosen.forEach(({ leaf, candidate }) => {
    if (leaf.id != null) result.set(leaf.id, toHit(index, candidate, shared));
  });

  // Sekcje: własny tytuł, jeśli jest na papierze w całości; inaczej zaznaczenie pól z tej sekcji.
  const descendantsHits = (field) => {
    const hits = [];
    (childrenOf.get(field.id) ?? []).forEach((child) => {
      if (child.group) hits.push(...descendantsHits(child));
      else if (result.has(child.id)) hits.push(result.get(child.id));
    });
    return hits;
  };
  [...fields]
    .reverse()
    .filter((field) => field.group && field.id != null)
    .forEach((field) => {
      const [own] = field.title?.trim()
        ? findCandidates(index, field.title, { excluded, group: true }).filter((c) => !c.weak)
        : [];
      if (own && own.recall >= 0.99) {
        result.set(field.id, toHit(index, own));
        return;
      }
      const hits = descendantsHits(field);
      if (hits.length) {
        const pages = new Map();
        hits.forEach((hit) => pages.set(hit.page, (pages.get(hit.page) ?? 0) + 1));
        const page = [...pages.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        const seen = new Set();
        const marks = hits
          .filter((hit) => hit.page === page)
          .flatMap((hit) => hit.marks)
          .filter((mark) => {
            const markKey = `${mark.item}:${mark.start}:${mark.end}`;
            if (seen.has(markKey)) return false;
            seen.add(markKey);
            return true;
          })
          .sort((a, b) => a.item - b.item || a.start - b.start);
        result.set(field.id, {
          page,
          marks,
          score: Math.max(...hits.map((hit) => hit.score)),
          fromChildren: true,
        });
        return;
      }
      if (own && own.score >= 0.6) result.set(field.id, toHit(index, own));
    });

  return result;
}
