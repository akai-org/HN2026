import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpAZ, FileText, Image, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPTED_FORMATS = ".pdf,.doc,.docx,.ods,.xlsx,.jpg,.jpeg,.png";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function ImportForm() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [splitBefore, setSplitBefore] = useState(new Set());
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  function addFiles(files) {
    const incomingFiles = Array.from(files);
    const tooLarge = incomingFiles.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError(`Plik „${tooLarge.name}” przekracza limit 10 MB.`);
      return;
    }

    setSelectedFiles((currentFiles) => {
      const uniqueIncoming = incomingFiles.filter((incoming) =>
        !currentFiles.some((current) =>
          current.name === incoming.name &&
          current.size === incoming.size &&
          current.lastModified === incoming.lastModified
        )
      );
      return [...currentFiles, ...uniqueIncoming];
    });
    setError("");
  }

  function handleFileChange(event) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function clearFile(index) {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index)
    );
    setSplitBefore((currentSplits) => {
      const nextSplits = new Set();
      currentSplits.forEach((splitIndex) => {
        if (splitIndex < index) nextSplits.add(splitIndex);
        if (splitIndex > index) nextSplits.add(splitIndex - 1);
      });
      return nextSplits;
    });
  }

  function toggleSplit(index) {
    setSplitBefore((currentSplits) => {
      const nextSplits = new Set(currentSplits);
      if (nextSplits.has(index)) nextSplits.delete(index);
      else nextSplits.add(index);
      return nextSplits;
    });
  }

  function clearAllFiles() {
    setSelectedFiles([]);
    setSplitBefore(new Set());
    setError("");
  }

  function sortFilesAlphabetically() {
    setSelectedFiles((currentFiles) =>
      [...currentFiles].sort((firstFile, secondFile) =>
        firstFile.name.localeCompare(secondFile.name, "pl", {
          sensitivity: "base",
        })
      )
    );
    setSplitBefore(new Set());
  }

  function getFileExtension(file) {
    const extension = file.name.split(".").pop();
    return extension && extension !== file.name ? extension.toUpperCase() : "PLIK";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFiles.length || isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      const convertedForms = [];

      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex += 1) {
        const selectedFile = selectedFiles[fileIndex];
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch("/api/forms/convert", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          let message = `Nie udało się przesłać pliku „${selectedFile.name}”.`;
          try {
            const responseError = await response.json();
            message = responseError.message || message;
          } catch {
            // Keep the default error message when the server returns no JSON.
          }
          throw new Error(message);
        }

        convertedForms.push({
          fileName: selectedFile.name,
          convertedForm: await response.json(),
          formNumber: 1 + [...splitBefore].filter((index) =>
            fileIndex >= index
          ).length,
        });
      }

      navigate("/digitalize", {
        state: {
          convertedForms,
          fileName: convertedForms[0]?.fileName,
          convertedForm: convertedForms[0]?.convertedForm,
        },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nie udało się przesłać formularzy.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
            AKAI · HackNation 2026
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Zamień formularz w e-Formularz
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="file-upload"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className={`flex cursor-pointer rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 px-6 text-center transition-colors hover:border-primary hover:bg-primary/10 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50 ${
              selectedFiles.length
                ? "h-24 items-center justify-center gap-4"
                : "h-64 flex-col items-center justify-center"
            }`}
          >
            {selectedFiles.length ? (
              <>
                <Upload aria-hidden="true" size={32} strokeWidth={1.7} className="shrink-0 text-primary" />
                <span className="text-left">
                  <span className="block text-base font-semibold">
                    Dodaj pliki
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground sm:text-sm">
                    Przeciągnij tutaj albo wybierz z dysku · do 10 MB na plik
                  </span>
                </span>
              </>
            ) : (
              <>
                <Upload aria-hidden="true" size={42} strokeWidth={1.5} className="mb-4 text-primary" />
                <span className="text-lg font-semibold">
                  Przeciągnij pliki tutaj albo wybierz z dysku
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  PDF, Word, Excel, OpenDocument albo zdjęcie (JPG, PNG). Każdy plik do 10 MB.
                </span>
              </>
            )}
            <input
              id="file-upload"
              className="sr-only"
              type="file"
              accept={ACCEPTED_FORMATS}
              multiple
              onChange={handleFileChange}
            />
          </label>

          <div className="mt-6 rounded-lg border border-border bg-background px-5 py-5">
            <div className="text-center">
              {selectedFiles.length ? (
                <>
                  <p className="text-base font-semibold">
                    Przesłane pliki ({selectedFiles.length})
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Kliknij pomiędzy plikami, aby ustawić granicę kolejnego formularza. Kliknij ponownie, żeby ją usunąć.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold">Przesłane pliki</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Po dodaniu plików możesz ustawić granice pomiędzy formularzami. Kliknij ponownie, żeby ją usunąć.
                  </p>
                </>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <div className="flex basis-full justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={sortFilesAlphabetically}
                  >
                    <ArrowUpAZ aria-hidden="true" />
                    Sortuj alfabetycznie
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={clearAllFiles}
                  >
                    <Trash2 aria-hidden="true" />
                    Wyczyść wszystko
                  </Button>
                </div>
                {selectedFiles.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="contents">
                    {index === 0 && (
                      <div className="flex basis-full items-center gap-3 py-2 text-xs font-semibold text-primary">
                        <span className="h-px flex-1 bg-primary" />
                        Granica — Formularz 1
                        <span className="h-px flex-1 bg-primary" />
                      </div>
                    )}
                    {index > 0 && (
                      <button
                        type="button"
                        className={`flex basis-full items-center gap-3 py-2 text-xs ${
                          splitBefore.has(index)
                            ? "font-semibold text-primary"
                            : "font-semibold text-muted-foreground"
                        }`}
                        aria-label={splitBefore.has(index)
                          ? `Usuń granicę przed plikiem ${file.name}`
                          : `Dodaj granicę przed plikiem ${file.name}`}
                        onClick={() => toggleSplit(index)}
                      >
                        <span className={`h-px flex-1 ${
                          splitBefore.has(index) ? "bg-primary" : "bg-border"
                        }`} />
                        {splitBefore.has(index)
                          ? `Granica — Formularz ${1 + [...splitBefore].filter((splitIndex) => splitIndex <= index).length}`
                          : "Kliknij, aby ustawić granicę"}
                        <span className={`h-px flex-1 ${
                          splitBefore.has(index) ? "bg-primary" : "bg-border"
                        }`} />
                      </button>
                    )}
                    <div className="relative flex h-24 w-full items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 pr-10">
                      <span className="relative flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                        {file.type.startsWith("image/") ? (
                          <Image aria-hidden="true" size={24} />
                        ) : (
                          <FileText aria-hidden="true" size={24} />
                        )}
                        <span className="absolute -bottom-1 right-1 rounded-sm bg-primary px-1 py-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                          {getFileExtension(file)}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={file.name}>
                          {file.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-2 top-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Usuń plik ${file.name}`}
                        onClick={() => clearFile(index)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              {error && (
                <p
                  className="text-sm text-destructive sm:mr-auto sm:max-w-md"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <Button type="submit" disabled={!selectedFiles.length || isSubmitting}>
                {isSubmitting ? "Cyfryzowanie..." : "Cyfryzuj formularze"}
              </Button>
            </div>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pliki zostaną wykorzystane wyłącznie do przygotowania struktury formularzy.
        </p>
      </div>
    </main>
  );
}

export default ImportForm;
