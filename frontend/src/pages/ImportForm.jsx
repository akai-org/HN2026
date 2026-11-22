import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Divider from "@/components/Divider";
import FileRow from "@/components/FileRow";
import { ArrowUpAZ, Trash, Upload, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, fileKey, formNumberAt } from "@/lib/uploads";
import { cn } from "@/lib/utils";

export default function ImportForm() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  // Indexes of the files that start a new form. The first file always starts form 1, so 0 is never here.
  const [splitBefore, setSplitBefore] = useState(() => new Set());
  const [error, setError] = useState("");

  function addFiles(fileList) {
    const incoming = [...fileList];
    if (!incoming.length) return;
    const tooLarge = incoming.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError(`Plik „${tooLarge.name}” przekracza limit 10 MB.`);
      return;
    }
    setFiles((current) => {
      const known = new Set(current.map(fileKey));
      return [...current, ...incoming.filter((file) => !known.has(fileKey(file)))];
    });
    setError("");
  }

  function removeFile(index) {
    setFiles((current) => current.toSpliced(index, 1));
    setSplitBefore(
      (current) =>
        new Set(
          [...current]
            .filter((split) => split !== index)
            .map((split) => (split > index ? split - 1 : split))
            .filter((split) => split > 0),
        ),
    );
  }

  function toggleSplit(index) {
    setSplitBefore((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function sortByName() {
    setFiles((current) =>
      current.toSorted((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" })),
    );
    setSplitBefore(new Set());
  }

  function clearAll() {
    setFiles([]);
    setSplitBefore(new Set());
    setError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    navigate("/digitalize", { state: { selectedFiles: files, splitBefore: [...splitBefore] } });
  }

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
                Przesłane pliki{files.length > 0 && ` (${files.length})`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {files.length
                  ? "Kliknij pomiędzy plikami, aby ustawić granicę kolejnego formularza."
                  : "Po dodaniu plików możesz ustawić granice pomiędzy formularzami."}{" "}
                Kliknij ponownie, żeby ją usunąć.
              </p>
            </div>

            {files.length > 0 && (
              <>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={sortByName}>
                    <ArrowUpAZ />
                    Sortuj alfabetycznie
                  </Button>
                  <Button variant="destructive" size="sm" onClick={clearAll}>
                    <Trash />
                    Wyczyść wszystko
                  </Button>
                </div>

                <ol className="mt-3 space-y-3">
                  {files.map((file, index) => (
                    <li key={fileKey(file)} className="space-y-3">
                      <FormBoundary
                        index={index}
                        fileName={file.name}
                        splitBefore={splitBefore}
                        onToggle={toggleSplit}
                      />
                      <FileRow
                        file={file}
                        className="bg-muted/20"
                        action={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Usuń plik ${file.name}`}
                            onClick={() => removeFile(index)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X />
                          </Button>
                        }
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
              <Button type="submit" disabled={!files.length}>
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

/** The line above a file: where its form starts, or a button that makes it start a new form. */
function FormBoundary({ index, fileName, splitBefore, onToggle }) {
  if (index === 0) {
    return <Divider className="py-2 text-primary">Granica — Formularz 1</Divider>;
  }

  const isSplit = splitBefore.has(index);
  return (
    <button
      type="button"
      aria-label={
        isSplit ? `Usuń granicę przed plikiem ${fileName}` : `Dodaj granicę przed plikiem ${fileName}`
      }
      onClick={() => onToggle(index)}
      className={cn(
        "block w-full rounded-sm py-2 focus-ring",
        isSplit ? "text-primary" : "text-muted-foreground hover:text-primary",
      )}
    >
      <Divider>
        {isSplit ? `Granica — Formularz ${formNumberAt(index, splitBefore)}` : "Kliknij, aby ustawić granicę"}
      </Divider>
    </button>
  );
}
