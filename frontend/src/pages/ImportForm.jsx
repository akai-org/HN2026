import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FileRow from "@/components/FileRow";
import FileThumb from "@/components/FileThumb";
import { ArrowUpAZ, ChevronDown, Layers, Pencil, Trash, Upload, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/formDefinition";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, fileKey, flattenGroups } from "@/lib/uploads";
import { cn } from "@/lib/utils";

let nextGroupId = 1;
const newGroup = (files, name = "") => ({ id: `formularz-${nextGroupId++}`, files, name });
const MAX_NAME_LENGTH = 80;
/** Name the official gave the group of forms, or its number among the groups ("Grupa 2"). */
const groupLabel = (group, groupNumber) => group.name || `Grupa ${groupNumber}`;
const formsLabel = (count) => `${count} ${plural(count, "formularz", "formularze", "formularzy")}`;
/** Number of each group among the multi-file entries (null for a single form). */
const groupNumbers = (groups) => {
  let count = 0;
  return groups.map((group) => (group.files.length > 1 ? ++count : null));
};
const byName = (a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" });

export default function ImportForm() {
  const navigate = useNavigate();
  // Forms as groups of files, in sending order. A new file is a form of its own; in grouping mode the
  // official ticks the files of one form (e.g. the pages of a scan) and joins them into one group.
  const [groups, setGroups] = useState([]);
  const [isGrouping, setIsGrouping] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // fileKey of the ticked files
  const [collapsed, setCollapsed] = useState(() => new Set()); // ids of the folded groups
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const files = groups.flatMap((group) => group.files);

  function addFiles(fileList) {
    const incoming = [...fileList];
    if (!incoming.length) return;
    const tooLarge = incoming.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError(`Plik „${tooLarge.name}” przekracza limit 10 MB.`);
      return;
    }
    setGroups((current) => {
      const known = new Set(current.flatMap((group) => group.files).map(fileKey));
      const fresh = incoming.filter((file) => !known.has(fileKey(file)));
      return [...current, ...fresh.map((file) => newGroup([file]))];
    });
    setError("");
  }

  function removeFile(file) {
    const key = fileKey(file);
    setGroups((current) =>
      current
        .map((group) => ({ ...group, files: group.files.filter((candidate) => fileKey(candidate) !== key) }))
        .filter((group) => group.files.length > 0),
    );
    setSelected((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setNotice(`Usunięto plik ${file.name}.`);
  }

  function toggleFiles(list, isOn) {
    setSelected((current) => {
      const next = new Set(current);
      for (const file of list) {
        if (isOn) next.add(fileKey(file));
        else next.delete(fileKey(file));
      }
      return next;
    });
  }

  function startGrouping() {
    setIsGrouping(true);
    setSelected(new Set());
    setNotice("Tryb grupowania: zaznacz formularze, które mają trafić do jednej grupy.");
  }

  function stopGrouping() {
    setIsGrouping(false);
    setSelected(new Set());
  }

  /** Joins the ticked forms (in list order) into one group, placed where the first of them was. */
  function joinSelected() {
    const chosen = files.filter((file) => selected.has(fileKey(file)));
    if (chosen.length < 2) return;
    const sources = groups.filter((group) => group.files.some((file) => selected.has(fileKey(file))));
    const at = groups.indexOf(sources[0]);
    const name = sources.find((group) => group.name)?.name ?? "";
    const rest = groups.map((group) => ({
      ...group,
      files: group.files.filter((file) => !selected.has(fileKey(file))),
    }));
    const joined = newGroup(chosen, name);
    const next = [...rest.slice(0, at), joined, ...rest.slice(at)].filter((group) => group.files.length);
    setGroups(next);
    stopGrouping();
    const label = groupLabel(joined, groupNumbers(next)[next.indexOf(joined)]);
    setNotice(`Utworzono grupę „${label}” z ${chosen.length} formularzy. Ołówek przy grupie zmienia jej nazwę.`);
  }

  function splitGroup(group) {
    setGroups((current) =>
      current.flatMap((candidate) => (candidate.id === group.id ? group.files.map((file) => newGroup([file])) : [candidate])),
    );
    setNotice(`Rozgrupowano ${formsLabel(group.files.length)}.`);
  }

  function renameGroup(id, name) {
    const index = groups.findIndex((group) => group.id === id);
    if (index < 0 || groups[index].name === name) return;
    setGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
    const fallback = `Grupa ${groupNumbers(groups)[index]}`;
    setNotice(name ? `Grupa nazywa się teraz „${name}”.` : `Przywrócono nazwę „${fallback}”.`);
  }

  function toggleCollapsed(id) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortByName() {
    setGroups((current) =>
      current
        .map((group) => ({ ...group, files: group.files.toSorted(byName) }))
        .toSorted((a, b) => byName(a.files[0], b.files[0])),
    );
  }

  function clearAll() {
    setGroups([]);
    stopGrouping();
    setCollapsed(new Set());
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    const { files: ordered, splitBefore } = flattenGroups(groups);
    // Only groups have names; a group without one is shown further on as "Grupa N", like here.
    const numbers = groupNumbers(groups);
    const formNames = groups.map((group, index) => (numbers[index] ? groupLabel(group, numbers[index]) : ""));
    navigate("/digitalize", { state: { selectedFiles: ordered, splitBefore, formNames } });
  }

  const selectedCount = selected.size;
  const numbersInList = groupNumbers(groups);

  return (
    <div className="px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Zamień formularz w e-Formularz
        </h1>

        <form onSubmit={submit}>
          <DropZone isCompact={files.length > 0} onFiles={addFiles} />

          <section aria-labelledby="file-list-title" className="mt-6 rounded-lg border bg-background p-5">
            <div className="text-center">
              <h2 id="file-list-title" className="text-base font-semibold">
                Formularze{files.length > 0 && ` (${files.length})`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!files.length
                  ? "Każdy dodany plik to osobny formularz. Formularze możesz potem połączyć w nazwane grupy."
                  : isGrouping
                    ? "Zaznacz formularze, które mają trafić do jednej grupy, i kliknij „Utwórz grupę”."
                    : "Każdy plik to osobny formularz. Przyciskiem „Grupuj formularze” połączysz je w grupę, a ołówkiem przy grupie zmienisz jej nazwę."}
              </p>
            </div>
            <p role="status" className="sr-only">
              {notice}
            </p>

            {files.length > 0 && (
              <>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {files.length > 1 && !isGrouping && (
                    <Button variant="outline" size="sm" onClick={startGrouping}>
                      <Layers />
                      Grupuj formularze
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={sortByName} disabled={isGrouping}>
                    <ArrowUpAZ />
                    Sortuj alfabetycznie
                  </Button>
                  <Button variant="destructive" size="sm" onClick={clearAll}>
                    <Trash />
                    Wyczyść wszystko
                  </Button>
                </div>

                {isGrouping && (
                  <div
                    role="region"
                    aria-label="Grupowanie formularzy"
                    className="sticky top-2 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/50 bg-background/95 px-3 py-2 shadow-md backdrop-blur"
                  >
                    <Layers size={18} className="text-primary" />
                    <span className="mr-auto text-sm font-medium" aria-live="polite">
                      Zaznaczono {selectedCount} z {files.length}
                    </span>
                    <Button size="sm" onClick={joinSelected} disabled={selectedCount < 2}>
                      Utwórz grupę
                    </Button>
                    <Button variant="ghost" size="sm" onClick={stopGrouping}>
                      Anuluj
                    </Button>
                  </div>
                )}

                <ol className="mt-3 space-y-3">
                  {groups.map((group, index) => (
                    <li key={group.id}>
                      <FormGroup
                        group={group}
                        groupNumber={numbersInList[index]}
                        isGrouping={isGrouping}
                        isCollapsed={collapsed.has(group.id)}
                        selected={selected}
                        onToggleFiles={toggleFiles}
                        onToggleCollapsed={() => toggleCollapsed(group.id)}
                        onSplit={() => splitGroup(group)}
                        onRename={(name) => renameGroup(group.id, name)}
                        onRemove={removeFile}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )}

            <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              {error && (
                <p role="alert" className="text-sm text-destructive sm:mr-auto sm:max-w-md">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={!files.length || isGrouping}>
                Cyfryzuj formularze
              </Button>
            </div>
          </section>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pliki zostaną wykorzystane wyłącznie do przygotowania struktury formularzy.
        </p>
      </div>
    </div>
  );
}

/**
 * Editing a form name in place: the pencil turns the name into a field; Enter or leaving the field saves,
 * Esc cancels. An empty name brings back the number ("Grupa 2").
 */
function useNameEditor(name, onRename) {
  const [draft, setDraft] = useState(null); // null: not editing
  const isEditingRef = useRef(false);
  const refocus = useRef(false);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [isEditing]);

  function finish(value, { save, returnFocus }) {
    if (!isEditingRef.current) return; // Esc already closed the field; its blur must not save
    isEditingRef.current = false;
    if (save) onRename(value.trim().slice(0, MAX_NAME_LENGTH));
    refocus.current = returnFocus;
    setDraft(null);
  }

  return {
    isEditing,
    buttonRef,
    start() {
      isEditingRef.current = true;
      setDraft(name);
    },
    inputProps: {
      ref: inputRef,
      value: draft ?? "",
      maxLength: MAX_NAME_LENGTH,
      onChange: (event) => setDraft(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault(); // inside the upload <form>: Enter must not send the files
          finish(event.currentTarget.value, { save: true, returnFocus: true });
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish("", { save: false, returnFocus: true });
        }
      },
      onBlur: (event) => finish(event.currentTarget.value, { save: true, returnFocus: false }),
      onClick: (event) => event.stopPropagation(),
    },
  };
}

function NameInput({ inputProps, placeholder, className }) {
  return (
    <input
      {...inputProps}
      type="text"
      aria-label="Nazwa grupy formularzy"
      placeholder={placeholder}
      className={cn(
        "h-8 min-w-0 rounded-md border border-primary bg-background px-2 text-sm font-semibold focus-ring",
        className,
      )}
    />
  );
}

function RenameButton({ buttonRef, onStart, label }) {
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon-sm"
      aria-label={`Zmień nazwę grupy: ${label}`}
      title="Zmień nazwę grupy"
      onClick={(event) => {
        event.stopPropagation();
        onStart();
      }}
      className="text-muted-foreground hover:text-primary"
    >
      <Pencil />
    </Button>
  );
}

/**
 * One entry of the list. A single file (one form) is a plain row; a group of forms is a card that can be
 * folded (then it shows only small previews), renamed with the pencil and ungrouped. In grouping mode every
 * form gets a checkbox.
 */
function FormGroup({
  group,
  groupNumber,
  isGrouping,
  isCollapsed,
  selected,
  onToggleFiles,
  onToggleCollapsed,
  onSplit,
  onRename,
  onRemove,
}) {
  const { isEditing, start, inputProps, buttonRef } = useNameEditor(group.name, onRename);
  const isMulti = group.files.length > 1;
  const label = groupLabel(group, groupNumber);
  const bodyId = `${group.id}-pliki`;
  const allSelected = group.files.every((file) => selected.has(fileKey(file)));

  if (!isMulti) {
    const [file] = group.files;
    return (
      <SelectableFile
        file={file}
        isGrouping={isGrouping}
        isSelected={selected.has(fileKey(file))}
        onToggle={(isOn) => onToggleFiles([file], isOn)}
        onRemove={() => onRemove(file)}
      />
    );
  }

  return (
    <section aria-label={`${label}, ${formsLabel(group.files.length)}`} className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {isGrouping && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onToggleFiles(group.files, event.target.checked)}
            aria-label={`Zaznacz wszystkie formularze: ${label}`}
            className="size-5 accent-primary"
          />
        )}
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <ChevronDown size={18} className={cn("shrink-0 text-primary", isCollapsed && "-rotate-90")} />
            <NameInput inputProps={inputProps} placeholder={`Grupa ${groupNumber}`} className="w-full max-w-80" />
            <span className="shrink-0 text-sm text-muted-foreground">· {formsLabel(group.files.length)}</span>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            onClick={onToggleCollapsed}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-ring"
          >
            <ChevronDown size={18} className={cn("shrink-0 text-primary transition-transform", isCollapsed && "-rotate-90")} />
            <span className="truncate text-sm font-semibold">{label}</span>
            <span className="shrink-0 text-sm text-muted-foreground">· {formsLabel(group.files.length)}</span>
            {isCollapsed && (
              <span className="ml-1 flex items-center gap-1" aria-hidden="true">
                {group.files.slice(0, 6).map((file) => (
                  <FileThumb key={fileKey(file)} file={file} size="xs" />
                ))}
                {group.files.length > 6 && (
                  <span className="text-xs text-muted-foreground">+{group.files.length - 6}</span>
                )}
              </span>
            )}
          </button>
        )}
        {!isGrouping && !isEditing && <RenameButton buttonRef={buttonRef} onStart={start} label={label} />}
        {!isGrouping && (
          <Button variant="ghost" size="sm" onClick={onSplit}>
            Rozgrupuj
          </Button>
        )}
      </div>
      {!isCollapsed && (
        <div id={bodyId} className="mt-3 space-y-2">
          {group.files.map((file, index) => (
            <SelectableFile
              key={fileKey(file)}
              file={file}
              isGrouping={isGrouping}
              isSelected={selected.has(fileKey(file))}
              onToggle={(isOn) => onToggleFiles([file], isOn)}
              onRemove={() => onRemove(file)}
              className="bg-background"
            >
              <p className="mt-1 text-xs font-medium text-primary">
                Formularz {index + 1} z {group.files.length}
              </p>
            </SelectableFile>
          ))}
        </div>
      )}
    </section>
  );
}

/** A file row; in grouping mode the whole row ticks the file. */
function SelectableFile({ file, isGrouping, isSelected, onToggle, onRemove, className, children }) {
  return (
    <FileRow
      file={file}
      onClick={isGrouping ? () => onToggle(!isSelected) : undefined}
      className={cn(
        "bg-muted/20",
        isGrouping && "cursor-pointer hover:border-primary/60",
        isGrouping && isSelected && "border-primary bg-primary/10 ring-2 ring-primary/30",
        className,
      )}
      leading={
        isGrouping && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => onToggle(event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Zaznacz plik ${file.name}`}
            className="size-5 shrink-0 accent-primary"
          />
        )
      }
      action={
        !isGrouping && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Usuń plik ${file.name}`}
            onClick={onRemove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X />
          </Button>
        )
      }
    >
      {children}
    </FileRow>
  );
}

function DropZone({ isCompact, onFiles }) {
  return (
    <label
      htmlFor="file-upload"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 px-6 text-center transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50 hover:border-primary hover:bg-primary/10",
        isCompact ? "h-24 gap-4" : "h-64 flex-col",
      )}
    >
      {isCompact ? (
        <>
          <Upload size={32} strokeWidth={1.7} className="shrink-0 text-primary" />
          <span className="text-left">
            <span className="block text-base font-semibold">Dodaj pliki</span>
            <span className="mt-1 block text-xs text-muted-foreground sm:text-sm">
              Przeciągnij tutaj albo wybierz z dysku · do 10 MB na plik
            </span>
          </span>
        </>
      ) : (
        <>
          <Upload size={42} strokeWidth={1.5} className="mb-4 text-primary" />
          <span className="text-lg font-semibold">Przeciągnij pliki tutaj albo wybierz z dysku</span>
          <span className="mt-2 text-sm text-muted-foreground">
            PDF, Word, Excel, OpenDocument albo zdjęcie (JPG, PNG). Każdy plik do 10 MB.
          </span>
        </>
      )}
      <input
        id="file-upload"
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}
