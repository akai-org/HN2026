import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Pencil } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { downloadJson } from "@/lib/formDefinition";
import { cn } from "@/lib/utils";
import Panel from "./Panel";

/**
 * Lines [start, end] of the object whose `"id"` is `id` in JSON.stringify(…, null, 2) output:
 * the id line sits one level inside the object, whose braces are at the indentation two spaces lower.
 */
function objectRange(lines, id) {
  if (!id) return null;
  const idLine = lines.findIndex((line) => line.trimStart().startsWith(`"id": ${JSON.stringify(id)}`));
  if (idLine < 0) return null;

  const indent = lines[idLine].search(/\S/) - 2;
  const indentOf = (line) => line.search(/\S/);
  let start = idLine;
  while (start > 0 && !(indentOf(lines[start]) === indent && lines[start].trimEnd().endsWith("{"))) start -= 1;
  let end = start + 1;
  while (end < lines.length - 1 && !(indentOf(lines[end]) === indent && lines[end].trimStart().startsWith("}"))) end += 1;
  return [start, end];
}

const ID_LINE = /^\s*"id":\s*"((?:[^"\\]|\\.)*)",?\s*$/;

/**
 * For each line, the id (from `fieldIds`) of the innermost field object containing it, or null.
 * Relies on the JSON.stringify(…, null, 2) layout: objects and arrays open at the end of a line
 * and close at the start of another, and string values never start with a bracket.
 */
function lineOwners(lines, fieldIds) {
  const owners = new Array(lines.length).fill(null);
  if (!fieldIds?.size) return owners;
  const stack = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("}") || trimmed.startsWith("]")) {
      const node = stack.pop();
      // Inner objects close first, so `??=` keeps the innermost owner.
      if (node?.id) for (let i = node.start; i <= index; i += 1) owners[i] ??= node.id;
      return;
    }
    const idMatch = line.match(ID_LINE);
    if (idMatch && stack.length) {
      const id = idMatch[1].replace(/\\(.)/g, "$1");
      if (fieldIds.has(id)) stack[stack.length - 1].id = id;
    }
    if (trimmed.endsWith("{") || trimmed.endsWith("[")) stack.push({ start: index, id: null });
  });
  return owners;
}

/** Runs of consecutive lines with the same owner: [{ owner, start, end }]. */
function lineGroups(owners) {
  const groups = [];
  owners.forEach((owner, index) => {
    const last = groups[groups.length - 1];
    if (last && last.owner === owner) last.end = index;
    else groups.push({ owner, start: index, end: index });
  });
  return groups;
}

function editableFragment(lines, range) {
  if (!range) return "";
  return lines
    .slice(range[0], range[1] + 1)
    .join("\n")
    .trim()
    .replace(/^"field":\s*/, "")
    .replace(/,$/, "");
}

export default function JsonPanel({ form, selectedId, fieldIds, onSelect, onEditFragment, onRegenerateFragment }) {
  const text = useMemo(() => JSON.stringify(form, null, 2), [form]);
  const lines = useMemo(() => text.split("\n"), [text]);
  const range = useMemo(() => objectRange(lines, selectedId), [lines, selectedId]);
  const groups = useMemo(() => lineGroups(lineOwners(lines, fieldIds)), [lines, fieldIds]);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const bodyRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    setEditing(false);
    setEditError("");
  }, [selectedId]);

  useEffect(() => {
    if (!editing || !range) return;
    setEditDraft(editableFragment(lines, range));
  }, [editing, selectedId]);

  // Scroll only the panel (scrollIntoView would also move the page).
  useEffect(() => {
    const body = bodyRef.current;
    const start = startRef.current;
    if (!body || !start || !range) return;
    body.scrollTo({ top: Math.max(0, start.offsetTop - 48) });
  }, [range]);

  async function copy() {
    const fragment = range ? lines.slice(range[0], range[1] + 1).join("\n").trim().replace(/^"field": /, "") : text;
    try {
      await navigator.clipboard.writeText(fragment.replace(/,$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function toggleEditing() {
    if (!range) return;
    if (editing) {
      setEditing(false);
      setEditError("");
      return;
    }
    const fragment = editableFragment(lines, range);
    setEditDraft(fragment);
    setEditError("");
    setEditing(true);
  }

  function changeFragment(value) {
    setEditDraft(value);
    setEditStatus("");
    try {
      const replacement = JSON.parse(value);
      if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) {
        setEditError("Fragment musi być obiektem JSON.");
        return;
      }
      if (replacement?.id !== selectedId) {
        setEditError("Pole id nie może zostać zmienione podczas edycji fragmentu.");
        return;
      }
      setEditError("");
      onEditFragment?.(selectedId, replacement);
    } catch {
      setEditError("Nieprawidłowy JSON. Zmiany zostaną zastosowane po usunięciu błędu.");
    }
  }

  function parseEditedFragment() {
    try {
      const replacement = JSON.parse(editDraft);
      if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) {
        setEditError("Fragment musi być obiektem JSON.");
        return null;
      }
      if (replacement?.id !== selectedId) {
        setEditError("Pole id nie może zostać zmienione podczas edycji fragmentu.");
        return null;
      }
      setEditError("");
      return replacement;
    } catch {
      setEditError("Nieprawidłowy JSON.");
      return null;
    }
  }

  function saveFragment() {
    const replacement = parseEditedFragment();
    if (!replacement) return;
    onRegenerateFragment?.(selectedId, replacement);
    setEditStatus("Zapisano i wygenerowano formularz ponownie");
  }

  const digits = String(lines.length).length;

  function renderLine(index) {
    const isHighlighted = range && index >= range[0] && index <= range[1];
    return (
      <div
        key={index}
        ref={range && index === range[0] ? startRef : undefined}
        className={cn("flex pr-4", isHighlighted && "bg-amber-100")}
      >
        <span
          aria-hidden="true"
          className={cn(
            "sticky left-0 select-none border-r border-border px-2 text-right text-muted-foreground",
            isHighlighted ? "bg-amber-200/70" : "bg-background",
          )}
          style={{ minWidth: `${digits + 2}ch` }}
        >
          {index + 1}
        </span>
        <span className="whitespace-pre pl-3">{lines[index]}</span>
      </div>
    );
  }

  function selectFromJson(id) {
    // Don't treat finishing a text selection (to copy part of the JSON) as a click.
    if (window.getSelection()?.toString()) return;
    onSelect(id);
  }

  return (
    <Panel
      number={3}
      title="JSON"
      subtitle={range ? `zaznaczone linie ${range[0] + 1}–${range[1] + 1}` : `${lines.length} linii`}
      bodyRef={bodyRef}
      actions={
        <>
          {range && (
            <button
              type="button"
              className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
              onClick={toggleEditing}
              title={editing ? "Zakończ edycję fragmentu" : "Edytuj zaznaczony fragment"}
            >
              <Pencil />
              {editing ? "Zakończ" : "Edytuj fragment"}
            </button>
          )}
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
            onClick={copy}
            title={range ? "Kopiuj zaznaczony fragment" : "Kopiuj cały JSON"}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Skopiowano" : range ? "Kopiuj fragment" : "Kopiuj"}
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
            onClick={() => downloadJson(form)}
          >
            <Download />
            Pobierz
          </button>
        </>
      }
    >
      {editing ? (
        <div className="p-3">
          <textarea
            value={editDraft}
            onChange={(event) => changeFragment(event.target.value)}
            spellCheck="false"
            aria-label="Edytor zaznaczonego fragmentu JSON"
            className="min-h-72 w-full resize-y rounded-md border border-amber-400 bg-background p-3 font-mono text-xs leading-5 outline-none focus:ring-3 focus:ring-ring/50"
          />
          {editError && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{editError}</p>}
          {editStatus && !editError && (
            <p role="status" className="mt-2 text-xs font-medium text-emerald-700">{editStatus}</p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              onClick={() => {
                setEditing(false);
                setEditError("");
                setEditStatus("");
              }}
            >
              Anuluj
            </button>
            <button
              type="button"
              className={cn(buttonVariants({ size: "sm" }))}
              onClick={saveFragment}
            >
              Zapisz
            </button>
          </div>
        </div>
      ) : (
      <pre className="min-w-max py-2 font-mono text-xs leading-5" aria-label="JSON formularza">
        {groups.map(({ owner, start, end }) => {
          const rows = [];
          for (let index = start; index <= end; index += 1) rows.push(renderLine(index));
          if (!owner || !onSelect) return <Fragment key={start}>{rows}</Fragment>;
          return (
            <div
              key={start}
              role="button"
              tabIndex={0}
              aria-label={`Zaznacz pole ${owner} w formularzu`}
              onClick={() => selectFromJson(owner)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(owner);
                }
              }}
              className="cursor-pointer hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
