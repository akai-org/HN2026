// Pasek edycji zaznaczonego pola w podglądzie. Każda zmiana od razu przepisuje JSON.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Asterisk, Braces, Pencil, Trash2 } from "lucide-react";
import { isContainerType, isInputType, isRequired } from "../lib/formModel.js";
import { usePreview } from "./previewContext.js";

const toolButton =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40";

function RenameInput({ field }) {
  const { onRename, setRenamingId } = usePreview();
  const [draft, setDraft] = useState(field.title ?? "");
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = () => {
    if (draft.trim() && draft !== field.title) onRename(field.id, draft.trim());
    setRenamingId(null);
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label htmlFor={`rename-${field.id}`} className="sr-only">
        Nowa etykieta pola
      </label>
      <input
        id={`rename-${field.id}`}
        ref={ref}
        value={draft}
        maxLength={255}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setRenamingId(null);
          }
        }}
        className="h-10 min-w-0 flex-1 rounded-md border-2 border-(--blue) px-3 font-bold text-slate-900"
      />
      <button type="submit" className="h-10 rounded-lg bg-(--blue) px-3 text-sm font-semibold text-white hover:bg-(--blue-hover)">
        Zapisz
      </button>
      <button type="button" onClick={() => setRenamingId(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        Anuluj
      </button>
    </form>
  );
}

export default function FieldToolbar({ field }) {
  const { onToggleRequired, onMove, onDelete, onShowInJson, setRenamingId, renamingId } = usePreview();
  const canRequire = isInputType(field.type);
  const required = isRequired(field);
  const label = field.title || field.techName || "pole";

  return (
    <div
      role="toolbar"
      aria-label={`Edycja pola: ${label}`}
      className="absolute bottom-full left-1 z-20 mb-1 flex max-w-[calc(100%-0.5rem)] flex-wrap items-center gap-0.5 rounded-xl bg-white p-1 whitespace-nowrap shadow-lg ring-1 ring-slate-300 motion-safe:animate-[kv-pop-in_120ms_ease-out]"
    >
      <button type="button" className={toolButton} onClick={() => setRenamingId(field.id)} disabled={renamingId === field.id}>
        <Pencil aria-hidden="true" size={15} /> {isContainerType(field.type) ? "Zmień tytuł" : "Zmień etykietę"}
      </button>
      {canRequire && (
        <button
          type="button"
          aria-pressed={required}
          className={`${toolButton} ${required ? "bg-red-50 text-red-800 hover:bg-red-100" : ""}`}
          onClick={() => onToggleRequired(field.id, !required)}
        >
          <Asterisk aria-hidden="true" size={15} /> Obowiązkowe
        </button>
      )}
      <button type="button" className={toolButton} aria-label={`Przesuń wyżej: ${label}`} title="Przesuń wyżej" onClick={() => onMove(field.id, -1)}>
        <ArrowUp aria-hidden="true" size={15} />
      </button>
      <button type="button" className={toolButton} aria-label={`Przesuń niżej: ${label}`} title="Przesuń niżej" onClick={() => onMove(field.id, 1)}>
        <ArrowDown aria-hidden="true" size={15} />
      </button>
      <button type="button" className={toolButton} onClick={() => onShowInJson(field.id)}>
        <Braces aria-hidden="true" size={15} /> JSON<span className="sr-only">: pokaż fragment</span>
      </button>
      <button type="button" className={`${toolButton} text-red-700 hover:bg-red-50`} onClick={() => onDelete(field.id)}>
        <Trash2 aria-hidden="true" size={15} /> Usuń
      </button>
    </div>
  );
}

FieldToolbar.RenameInput = RenameInput;
