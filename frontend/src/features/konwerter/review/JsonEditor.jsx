// Edytor JSON (CodeMirror 6, MIT): składnia, zwijanie, wyszukiwanie, polskie komunikaty o błędach
// i podświetlenie fragmentu zaznaczonego pola. Tab nie jest przechwytywany, więc z edytora
// da się wyjść klawiaturą (WCAG 2.1.2).
import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { parseJson } from "../lib/jsonPositions.js";

const External = Annotation.define();
const setHighlight = StateEffect.define();

/** Podświetlenie zakresu (linie zaznaczonego pola). */
const highlightField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlight)) continue;
      const range = effect.value;
      if (!range) {
        next = Decoration.none;
        continue;
      }
      const doc = transaction.state.doc;
      const from = Math.max(0, Math.min(range.from, doc.length));
      const to = Math.max(from, Math.min(range.to, doc.length));
      const lines = [];
      for (let line = doc.lineAt(from).number; line <= doc.lineAt(to).number; line += 1) {
        lines.push(Decoration.line({ class: "cm-kv-highlight-line" }).range(doc.line(line).from));
      }
      next = Decoration.set(lines);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Kolory składni z kontrastem co najmniej 4.5:1 na białym tle.
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "#0b4ea2", fontWeight: "600" },
  { tag: tags.string, color: "#0f6b35" },
  { tag: tags.number, color: "#8a3b00" },
  { tag: [tags.bool, tags.null], color: "#6d28d9", fontWeight: "600" },
  { tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: "#475569" },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "#ffffff", color: "#0f172a" },
  ".cm-gutters": { backgroundColor: "#f8fafc", color: "#475569", borderRight: "1px solid #e2e8f0" },
  ".cm-activeLineGutter": { backgroundColor: "#eaf1fb", color: "#0b4ea2" },
  ".cm-activeLine": { backgroundColor: "rgb(234 241 251 / 0.55)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#c9dbf3 !important" },
  ".cm-cursor": { borderLeftColor: "#0b4ea2", borderLeftWidth: "2px" },
  ".cm-foldGutter .cm-gutterElement": { cursor: "pointer", padding: "0 4px" },
  ".cm-tooltip": { borderRadius: "10px", border: "1px solid #cbd5e1" },
  ".cm-diagnostic-error": { borderLeft: "4px solid #b91c1c" },
  ".cm-panels": { backgroundColor: "#f8fafc", color: "#0f172a" },
  ".cm-searchMatch": { backgroundColor: "#fde68a" },
});

const polishPhrases = EditorState.phrases.of({
  "Find": "Znajdź",
  "Replace": "Zamień",
  "next": "następny",
  "previous": "poprzedni",
  "all": "wszystkie",
  "match case": "wielkość liter",
  "regexp": "wyrażenie regularne",
  "by word": "całe słowa",
  "replace": "zamień",
  "replace all": "zamień wszystkie",
  "close": "zamknij",
  "Folded lines": "Zwinięte linie",
  "Unfolded lines": "Rozwinięte linie",
  "Fold line": "Zwiń linię",
  "Unfold line": "Rozwiń linię",
  "folded code": "zwinięty kod",
  "unfold": "rozwiń",
  "Diagnostics": "Błędy",
  "No diagnostics": "Brak błędów",
  "Go to line": "Przejdź do linii",
  "go": "przejdź",
});

const polishLinter = linter(
  (view) => {
    const result = parseJson(view.state.doc.toString());
    if (!result.error) return [];
    const from = Math.min(result.error.offset, view.state.doc.length);
    return [{ from, to: Math.min(view.state.doc.length, from + Math.max(1, result.error.length)), severity: "error", message: `Błąd JSON: ${result.error.message}` }];
  },
  { delay: 300 },
);

/** Minimalna zmiana między dwoma tekstami (wspólny początek i koniec), żeby nie gubić kursora. */
function minimalChange(before, after) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}

/**
 * @param {{ value: string, onChange: (text: string) => void, onCursor?: (offset: number) => void,
 *   highlight?: { from: number, to: number, scroll?: boolean, key?: string } | null, label: string, describedBy?: string }} props
 */
export default function JsonEditor({ value, onChange, onCursor, highlight, label, describedBy }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const callbacks = useRef({ onChange, onCursor });
  const timers = useRef({ change: 0, cursor: 0 });

  useEffect(() => {
    callbacks.current = { onChange, onCursor };
  }, [onChange, onCursor]);

  useEffect(() => {
    const flushChange = (view) => {
      clearTimeout(timers.current.change);
      timers.current.change = 0;
      callbacks.current.onChange?.(view.state.doc.toString());
    };
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter({ openText: "▾", closedText: "▸" }),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(highlightStyle),
          json(),
          lintGutter(),
          polishLinter,
          highlightField,
          theme,
          polishPhrases,
          EditorState.tabSize.of(2),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap]),
          EditorView.contentAttributes.of({
            "aria-label": label,
            ...(describedBy ? { "aria-describedby": describedBy } : {}),
            spellcheck: "false",
            tabindex: "0",
            autocorrect: "off",
            autocapitalize: "off",
          }),
          EditorView.domEventHandlers({
            blur: (_event, editorView) => {
              if (timers.current.change) flushChange(editorView);
            },
          }),
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some((transaction) => transaction.annotation(External));
            if (update.docChanged && !external) {
              clearTimeout(timers.current.change);
              timers.current.change = setTimeout(() => flushChange(update.view), 250);
            }
            const userMoved = update.transactions.some(
              (transaction) => transaction.isUserEvent("select") || transaction.isUserEvent("input") || transaction.isUserEvent("delete"),
            );
            if (update.selectionSet && userMoved && callbacks.current.onCursor) {
              clearTimeout(timers.current.cursor);
              const head = update.state.selection.main.head;
              timers.current.cursor = setTimeout(() => callbacks.current.onCursor?.(head), 200);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    const pending = timers.current;
    return () => {
      clearTimeout(pending.change);
      clearTimeout(pending.cursor);
      view.destroy();
      viewRef.current = null;
    };
    // Edytor tworzymy raz; wartość i podświetlenie synchronizują osobne efekty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zmiana z zewnątrz (podgląd formularza, cofnij/ponów): podmieniamy tylko różniący się fragment.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    clearTimeout(timers.current.change);
    timers.current.change = 0;
    view.dispatch({
      changes: minimalChange(current, value),
      annotations: [External.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  // Przewijamy tylko przy nowym zaznaczeniu (zmiana klucza), a nie przy każdej edycji tekstu.
  const scrolledKey = useRef(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const effects = [setHighlight.of(highlight ? { from: highlight.from, to: highlight.to } : null)];
    if (highlight?.scroll && highlight.key !== scrolledKey.current) {
      scrolledKey.current = highlight.key;
      effects.push(EditorView.scrollIntoView(Math.min(highlight.from, view.state.doc.length), { y: "start", yMargin: 48 }));
    }
    view.dispatch({ effects });
  }, [highlight]);

  return <div ref={hostRef} className="kv-editor-host h-full min-h-0 overflow-hidden" />;
}
