// Karta jednego formularza na liście: pliki (strony) w kolejności, podział i łączenie, stan rozpoznawania.
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  Eye,
  Merge,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Scissors,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { formStats } from "../lib/formModel.js";
import { isEditable } from "../lib/grouping.js";
import { FORMS, count, formatDuration, formatSize } from "../lib/text.js";
import { cachedPdfPages } from "../lib/pdfjs.js";
import FileThumb from "./FileThumb.jsx";
import { Badge, Button, IconButton } from "./primitives.jsx";

function StatusLine({ group, now }) {
  switch (group.status) {
    case "queued":
      return <Badge icon={Clock}>W kolejce</Badge>;
    case "processing":
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--blue)">
          <LoaderCircle aria-hidden="true" size={15} className="motion-safe:animate-spin" />
          Rozpoznawanie… {formatDuration(now - group.startedAt)}
        </span>
      );
    case "done":
      return group.approved ? (
        <Badge tone="green" icon={BadgeCheck}>Zatwierdzony</Badge>
      ) : (
        <Badge tone="green" icon={CircleCheck}>Rozpoznano</Badge>
      );
    case "error":
      return <Badge tone="red" icon={CircleAlert}>Nie udało się</Badge>;
    default:
      return <Badge tone="blue">Gotowy do rozpoznania</Badge>;
  }
}

function RenameField({ value, onSave, onCancel, label }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <label className="sr-only" htmlFor={`${label}-input`}>
        Nazwa formularza
      </label>
      <input
        id={`${label}-input`}
        ref={inputRef}
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        className="h-10 min-w-0 flex-1 rounded-lg border-2 border-slate-400 px-3 font-semibold text-slate-900 focus:border-(--blue)"
      />
      <Button type="submit" variant="primary" size="sm">
        Zapisz
      </Button>
      <Button variant="quiet" size="sm" onClick={onCancel}>
        Anuluj
      </Button>
    </form>
  );
}

function FileRow({ item, index, total, editable, onPreview, onMove, onRemove }) {
  const pages = cachedPdfPages(item);
  return (
    <div className="group/file flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 sm:gap-4">
      <span aria-hidden="true" className="w-6 shrink-0 text-right text-sm font-bold text-slate-500 tabular-nums">
        {index + 1}.
      </span>
      <button type="button" onClick={() => onPreview(item)} className="shrink-0 rounded-lg" aria-label={`Podgląd pliku ${item.name}`}>
        <FileThumb item={item} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900" title={item.name}>
          <span className="sr-only">Plik {index + 1} z {total}: </span>
          {item.name}
        </p>
        <p className="text-sm text-slate-600">
          {item.type?.label} · {formatSize(item.size)}
          {pages ? ` · ${count(pages, FORMS.page)}` : ""}
          {item.folder ? ` · folder ${item.folder}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton label={`Podgląd pliku ${item.name}`} icon={Eye} onClick={() => onPreview(item)} />
        {editable && (
          <>
            <IconButton label={`Przesuń wyżej: ${item.name}`} icon={ArrowUp} onClick={() => onMove(item.id, -1)} />
            <IconButton label={`Przesuń niżej: ${item.name}`} icon={ArrowDown} onClick={() => onMove(item.id, 1)} />
            <IconButton label={`Usuń plik ${item.name}`} icon={X} variant="danger" onClick={() => onRemove(item)} />
          </>
        )}
      </div>
    </div>
  );
}

export default function GroupCard({ group, index, items, problem, now, expanded, onToggle, canMergePrevious, actions, onPreview, onReview }) {
  const [renaming, setRenaming] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  const editable = isEditable(group);
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  const stats = group.status === "done" && group.doc?.form ? formStats(group.doc.form) : null;
  const warnings = group.result?.warnings?.length ?? 0;
  const busy = group.status === "queued" || group.status === "processing";

  return (
    <article
      aria-labelledby={titleId}
      className={`rounded-2xl border bg-white shadow-xs transition-colors motion-safe:animate-[kv-rise-in_240ms_ease-out] ${
        group.status === "error" || problem ? "border-red-300" : group.status === "done" ? "border-emerald-300" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? "Zwiń" : "Rozwiń"} listę plików formularza ${group.name}`}
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
        >
          <ChevronDown aria-hidden="true" size={20} className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-(--blue) uppercase">Formularz {index + 1}</p>
          {renaming ? (
            <RenameField
              label={titleId}
              value={group.name}
              onSave={(name) => {
                actions.rename(group.id, name);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h3 id={titleId} className="flex min-w-0 items-center gap-1 text-lg font-bold text-slate-900">
              <span className="truncate" title={group.name}>
                {group.name}
              </span>
              {group.origin === "upload" && (
                <IconButton label={`Zmień nazwę formularza ${group.name}`} icon={Pencil} size={15} onClick={() => setRenaming(true)} />
              )}
            </h3>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            {group.origin === "example" ? (
              <span>Przykład do testu</span>
            ) : group.origin === "import" ? (
              <span>Wczytany plik JSON</span>
            ) : (
              <span>
                {count(items.length, FORMS.file)} · {formatSize(totalSize)}
                {items.length > 1 ? " · połączymy je w jeden PDF" : ""}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <StatusLine group={group} now={now} />
          </p>

          {group.status === "processing" && (
            <div
              className="mt-2.5 h-1.5 max-w-md overflow-hidden rounded-full bg-(--blue-soft)"
              role="progressbar"
              aria-label={`Rozpoznawanie formularza ${group.name}`}
              aria-valuetext="W toku"
            >
              <div className="h-full w-1/3 rounded-full bg-(--blue) motion-safe:animate-[kv-indeterminate_1.4s_ease-in-out_infinite]" />
            </div>
          )}

          {stats && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
              <span className="font-semibold">{group.doc.form.title || "Formularz bez tytułu"}</span>
              <span>{count(stats.pages, FORMS.page)}, {count(stats.fields, FORMS.field)}</span>
              {warnings > 0 && <Badge tone="amber" icon={TriangleAlert}>{count(warnings, FORMS.issue)} z rozpoznawania</Badge>}
            </p>
          )}

          {group.status === "error" && (
            <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              {group.error}
            </p>
          )}
          {problem && editable && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              <TriangleAlert aria-hidden="true" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">{problem.message}</span>
              {problem.code === "NOT_MERGEABLE" && (
                <Button size="sm" onClick={() => actions.split(group.id, group.itemIds[1])}>
                  <Scissors aria-hidden="true" size={15} /> Rozdziel
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          {canMergePrevious && (
            <Button variant="quiet" size="sm" onClick={() => actions.mergeWithPrevious(group.id)}>
              <Merge aria-hidden="true" size={16} /> Połącz z poprzednim
            </Button>
          )}
          {editable && !problem && (
            <Button size="sm" onClick={() => actions.recognize([group.id])}>
              {group.status === "error" ? <RotateCcw aria-hidden="true" size={15} /> : null}
              {group.status === "error" ? "Spróbuj ponownie" : "Rozpoznaj"}
            </Button>
          )}
          {busy && (
            <Button size="sm" onClick={() => actions.cancel(group.id)}>
              Anuluj
            </Button>
          )}
          {group.status === "done" && (
            <Button variant="primary" size="sm" onClick={() => onReview(group)}>
              Sprawdź <ArrowRight aria-hidden="true" size={16} />
            </Button>
          )}
          <IconButton label={`Usuń formularz ${group.name}`} icon={Trash2} variant="danger" onClick={() => actions.removeGroup(group.id)} />
        </div>
      </div>

      <div id={bodyId} hidden={!expanded} className="border-t border-slate-100 px-2 py-2 sm:px-3">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-600">Ten formularz nie ma plików na liście (wynik wczytany bez oryginału).</p>
        ) : (
          <ol aria-label={`Pliki formularza ${group.name}`}>
            {items.map((item, itemIndex) => (
              <li key={item.id}>
                {itemIndex > 0 && editable && (
                  <div className="relative flex items-center gap-3 px-2">
                    <span aria-hidden="true" className="h-px flex-1 bg-slate-100" />
                    <button
                      type="button"
                      onClick={() => actions.split(group.id, item.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-600 opacity-70 transition hover:bg-(--blue-soft) hover:text-(--blue) hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Scissors aria-hidden="true" size={13} />
                      Rozdziel tutaj<span className="sr-only">: od pliku {item.name} zacznij nowy formularz</span>
                    </button>
                    <span aria-hidden="true" className="h-px flex-1 bg-slate-100" />
                  </div>
                )}
                <FileRow
                  item={item}
                  index={itemIndex}
                  total={items.length}
                  editable={editable}
                  onPreview={onPreview}
                  onMove={actions.moveItem}
                  onRemove={(target) => actions.removeItem(target.id)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
