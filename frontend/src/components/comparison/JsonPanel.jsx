import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Pencil } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { downloadJson } from "@/lib/formDefinition";
import { buttonProps, cn } from "@/lib/utils";
import Panel from "./Panel";

// The helpers below read the output of JSON.stringify(form, null, 2) line by line. They rely on its layout:
// objects and arrays open at the end of a line and close at the start of another, and a string value never
// starts with a bracket.

const ID_LINE = /^\s*"id":\s*"((?:[^"\\]|\\.)*)",?\s*$/;

const indentOf = (line) => line.search(/\S/);

/** Lines [start, end] of the object whose `"id"` is `id`; its braces sit one level above the id line. */
function objectRange(lines, id) {
  if (!id) return null;
  const idLine = lines.findIndex((line) => line.trimStart().startsWith(`"id": ${JSON.stringify(id)}`));
  if (idLine < 0) return null;

  const indent = indentOf(lines[idLine]) - 2;
  let start = idLine;
  while (start > 0 && !(indentOf(lines[start]) === indent && lines[start].trimEnd().endsWith("{")))
    start -= 1;
  let end = start + 1;
  while (
    end < lines.length - 1 &&
    !(indentOf(lines[end]) === indent && lines[end].trimStart().startsWith("}"))
  ) {
    end += 1;
  }
  return [start, end];
}

/** For each line, the id (one of `fieldIds`) of the innermost field object that contains it, or null. */
function lineOwners(lines, fieldIds) {
  const owners = new Array(lines.length).fill(null);
  if (!fieldIds?.size) return owners;

  const open = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("}") || trimmed.startsWith("]")) {
      const node = open.pop();
      // Inner objects close first, so `??=` keeps the innermost owner.
      if (node?.id) for (let i = node.start; i <= index; i += 1) owners[i] ??= node.id;
      return;
    }
    const idMatch = line.match(ID_LINE);
    if (idMatch && open.length) {
      const id = idMatch[1].replace(/\\(.)/g, "$1");
      if (fieldIds.has(id)) open.at(-1).id = id;
    }
    if (trimmed.endsWith("{") || trimmed.endsWith("[")) open.push({ start: index, id: null });
  });
  return owners;
}

/** Runs of consecutive lines with the same owner: [{ owner, start, end }]. */
function lineGroups(owners) {
  const groups = [];
  owners.forEach((owner, index) => {
    const last = groups.at(-1);
    if (last && last.owner === owner) last.end = index;
    else groups.push({ owner, start: index, end: index });
  });
  return groups;
}

/** The object on lines [start, end] as standalone, re-indented JSON. */
function fragmentAt(lines, [start, end]) {
  const text = lines
    .slice(start, end + 1)
    .join("\n")
    .trim()
    .replace(/^"field":\s*/, "")
    .replace(/,$/, "");
  return JSON.stringify(JSON.parse(text), null, 2);
}

/** The edited text as `{ value }`, or `{ error }`. The id must not change: the edit is put back by it. */
function parseFragment(text, id) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "Nieprawidłowy JSON. Zmiany zostaną zastosowane po usunięciu błędu." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Fragment musi być obiektem JSON." };
  }
  if (value.id !== id) return { error: "Pole id nie może zostać zmienione podczas edycji fragmentu." };
  return { value };
}

/**
 * The form JSON with line numbers. The selected node is highlighted and can be copied or edited; clicking
 * the lines of a field selects that field.
 */
export default function JsonPanel({ form, fieldIds, selectedId, onSelect, onEditNode }) {
  const text = useMemo(() => JSON.stringify(form, null, 2), [form]);
  const lines = useMemo(() => text.split("\n"), [text]);
  const range = useMemo(() => objectRange(lines, selectedId), [lines, selectedId]);
  const groups = useMemo(() => lineGroups(lineOwners(lines, fieldIds)), [lines, fieldIds]);
  const [editingId, setEditingId] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const bodyRef = useRef(null);
  const rangeStartRef = useRef(null);
  // Selecting another node closes the editor.
  const isEditing = range !== null && editingId === selectedId;
  const digits = String(lines.length).length;

  // Scroll only the panel: scrollIntoView would also move the page.
  useEffect(() => {
    if (!range || !bodyRef.current || !rangeStartRef.current) return;
    bodyRef.current.scrollTo({ top: Math.max(0, rangeStartRef.current.offsetTop - 48) });
  }, [range, isEditing]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(range ? fragmentAt(lines, range) : text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setIsCopied(false);
    }
  }

  function selectFromJson(id) {
    // Finishing a text selection (to copy part of the JSON) is not a click.
    if (window.getSelection()?.toString()) return;
    onSelect(id);
  }

  function renderLine(index) {
    const isHighlighted = range !== null && index >= range[0] && index <= range[1];
    return (
      <div
        key={index}
        ref={index === range?.[0] ? rangeStartRef : undefined}
        className={cn("flex pr-4", isHighlighted && "bg-amber-100")}
      >
        <span
          aria-hidden="true"
          className={cn(
            "sticky left-0 border-r px-2 text-right text-muted-foreground select-none",
            isHighlighted ? "bg-amber-200/70" : "bg-background",
          )}
          style={{ minWidth: `${digits + 2}ch` }}
        >
          {index + 1}
        </span>
        <span className="pl-3 whitespace-pre">{lines[index]}</span>
      </div>
    );
  }

  const actions = (
    <>
      {range && (
        <Button
          variant="ghost"
          size="xs"
          title={isEditing ? "Zakończ edycję fragmentu" : "Edytuj zaznaczony fragment"}
          onClick={() => setEditingId(isEditing ? null : selectedId)}
        >
          <Pencil />
          {isEditing ? "Zakończ" : "Edytuj fragment"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="xs"
        title={range ? "Kopiuj zaznaczony fragment" : "Kopiuj cały JSON"}
        onClick={copy}
      >
        {isCopied ? <Check /> : <Copy />}
        {isCopied ? "Skopiowano" : range ? "Kopiuj fragment" : "Kopiuj"}
      </Button>
      <Button variant="ghost" size="xs" onClick={() => downloadJson(form)}>
        <Download />
        Pobierz
      </Button>
    </>
  );

  return (
    <Panel
      number={3}
      title="JSON"
      subtitle={range ? `zaznaczone linie ${range[0] + 1}–${range[1] + 1}` : `${lines.length} linii`}
      actions={actions}
      bodyRef={bodyRef}
    >
      {isEditing ? (
        <FragmentEditor
          key={selectedId}
          id={selectedId}
          initialText={fragmentAt(lines, range)}
          onApply={onEditNode}
          onClose={() => setEditingId(null)}
        />
      ) : (
        <pre aria-label="JSON formularza" className="min-w-max py-2 font-mono text-xs leading-5">
          {groups.map(({ owner, start, end }) => {
            const rows = [];
            for (let index = start; index <= end; index += 1) rows.push(renderLine(index));
            if (!owner) return <Fragment key={start}>{rows}</Fragment>;
            return (
              <div
                key={start}
                {...buttonProps(() => selectFromJson(owner))}
                aria-label={`Zaznacz pole ${owner} w formularzu`}
                className="cursor-pointer hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              >
                {rows}
              </div>
            );
          })}
        </pre>
      )}
    </Panel>
  );
}

/**
 * Edits one node of the form as JSON. Valid text is applied as you type, so the preview follows the edit;
 * "Zapisz" marks the current text as saved and "Anuluj" goes back to the last saved text.
 */
function FragmentEditor({ id, initialText, onApply, onClose }) {
  const [draft, setDraft] = useState(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  function apply(text) {
    const parsed = parseFragment(text, id);
    setError(parsed.error ?? "");
    if (parsed.value) onApply(id, parsed.value);
    return Boolean(parsed.value);
  }

  function change(text) {
    setDraft(text);
    setIsSaved(false);
    apply(text);
  }

  function save() {
    if (!apply(draft)) return;
    setSavedText(draft);
    setIsSaved(true);
  }

  function cancel() {
    if (draft !== savedText) onApply(id, JSON.parse(savedText));
    onClose();
  }

  return (
    <div className="p-3">
      <textarea
        value={draft}
        onChange={(event) => change(event.target.value)}
        spellCheck={false}
        aria-label="Edytor zaznaczonego fragmentu JSON"
        className="min-h-72 w-full resize-y rounded-md border border-amber-400 bg-background p-3 font-mono text-xs leading-5 outline-none focus:ring-3 focus:ring-ring/50"
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {isSaved && (
        <p role="status" className="mt-2 text-xs font-medium text-success">
          Zapisano i wygenerowano formularz ponownie
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cancel}>
          Anuluj
        </Button>
        <Button size="sm" onClick={save}>
          Zapisz
        </Button>
      </div>
    </div>
  );
}
