// Powiązanie tekstu JSON z polami formularza: gdzie w tekście leży dane pole
// i które pole odpowiada miejscu, w którym stoi kursor. Używa jsonc-parser (MIT),
// który zna pozycję każdego węzła w tekście.
import { findNodeAtLocation, findNodeAtOffset, getNodePath, parse, parseTree, printParseErrorCode } from "jsonc-parser";

const STRICT = { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false };

const ERROR_MESSAGES = {
  InvalidSymbol: "niedozwolony znak",
  InvalidNumberFormat: "błędny zapis liczby",
  PropertyNameExpected: "brakuje nazwy pola w cudzysłowie",
  ValueExpected: "brakuje wartości",
  ColonExpected: "brakuje dwukropka",
  CommaExpected: "brakuje przecinka",
  CloseBraceExpected: "brakuje nawiasu zamykającego }",
  CloseBracketExpected: "brakuje nawiasu zamykającego ]",
  EndOfFileExpected: "po zamknięciu JSON-a jest jeszcze tekst",
  InvalidCommentToken: "komentarze są niedozwolone",
  UnexpectedEndOfComment: "niedokończony komentarz",
  UnexpectedEndOfString: "niedokończony tekst w cudzysłowie",
  UnexpectedEndOfNumber: "niedokończona liczba",
  InvalidUnicode: "błędny znak Unicode",
  InvalidEscapeCharacter: "błędny znak ucieczki (\\)",
  InvalidCharacter: "niedozwolony znak w tekście",
};

/** Numer linii i kolumny (od 1) dla pozycji w tekście. */
export function lineColumn(text, offset) {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}

/**
 * Parsuje JSON ściśle (bez komentarzy i przecinków na końcu).
 * @returns {{ value: any, error: null } | { value: null, error: { message: string, offset: number, length: number, line: number, column: number } }}
 */
export function parseJson(text) {
  if (!text.trim()) {
    return { value: null, error: { message: "JSON jest pusty", offset: 0, length: 0, line: 1, column: 1 } };
  }
  const errors = [];
  parse(text, errors, STRICT);
  if (errors.length === 0) {
    // Ostatnia linia obrony: jsonc-parser bywa łagodniejszy niż JSON.parse (np. dla znaków sterujących).
    try {
      return { value: JSON.parse(text), error: null };
    } catch (error) {
      return { value: null, error: { message: error.message, offset: 0, length: 0, line: 1, column: 1 } };
    }
  }
  const [first] = errors;
  const code = printParseErrorCode(first.error);
  return {
    value: null,
    error: {
      message: ERROR_MESSAGES[code] ?? code,
      offset: first.offset,
      length: first.length,
      ...lineColumn(text, first.offset),
    },
  };
}

/** Drzewo pozycji dla tekstu (null, gdy tekstu nie da się sparsować w ogóle). */
export function buildTree(text) {
  return parseTree(text, [], STRICT) ?? null;
}

/** Zakres { from, to } węzła pod daną ścieżką albo null. */
export function rangeForPath(tree, path) {
  if (!tree || !path) return null;
  const node = findNodeAtLocation(tree, path);
  return node ? { from: node.offset, to: node.offset + node.length } : null;
}

/** Ścieżka JSON (np. ["tabs", 0, "questions", 3, "field", "title"]) dla pozycji w tekście. */
export function pathAtOffset(tree, offset) {
  if (!tree) return [];
  const node = findNodeAtOffset(tree, offset, true);
  return node ? getNodePath(node) : [];
}
