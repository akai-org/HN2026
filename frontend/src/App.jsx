import { useState } from "react";
import { FileText, Image, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCEPTED_FORMATS = ".pdf,.doc,.docx,.ods,.xlsx,.jpg,.jpeg,.png";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setError("Plik jest za duży. Maksymalny rozmiar to 10 MB.");
      return;
    }

    setSelectedFile(file);
    setError("");
  }

  function clearFile() {
    setSelectedFile(null);
    setError("");
  }

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
            AKAI · HackNation 2026
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Zmień formularz w e-usługę
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Prześlij formularz, a przygotujemy jego cyfrową strukturę wraz z
            polami, zależnościami i dozwolonymi wartościami.
          </p>
        </div>

        <Card className="mx-auto max-w-2xl shadow-lg shadow-foreground/5">
          <CardHeader>
            <CardTitle className="text-xl">Dodaj formularz źródłowy</CardTitle>
            <p className="text-sm text-muted-foreground">
              Obsługujemy dokumenty PDF, Word, arkusze oraz obrazy.
            </p>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="file-upload"
              className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-within:border-primary"
            >
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload aria-hidden="true" size={26} />
              </span>
              <span className="font-medium">
                Kliknij, aby wybrać plik
              </span>
              <span className="mt-2 text-sm text-muted-foreground">
                PDF, DOC, DOCX, ODS, XLSX, JPG lub PNG · maks. 10 MB
              </span>
              <input
                id="file-upload"
                className="sr-only"
                type="file"
                accept={ACCEPTED_FORMATS}
                onChange={handleFileChange}
              />
            </label>

            {error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            {selectedFile && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                {selectedFile.type.startsWith("image/") ? (
                  <Image className="shrink-0 text-primary" aria-hidden="true" size={20} />
                ) : (
                  <FileText className="shrink-0 text-primary" aria-hidden="true" size={20} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · plik gotowy do analizy
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Usuń wybrany plik"
                  onClick={clearFile}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Plik zostanie wykorzystany wyłącznie do przygotowania struktury formularza.
        </p>
      </div>
    </main>
  );
}

export default App;
