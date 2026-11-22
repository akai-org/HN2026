import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, FileText, Image, X } from "@/components/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertFormFile } from "@/lib/api";

function getFileExtension(file) {
  const extension = file.name.split(".").pop();
  return extension && extension !== file.name ? extension.toUpperCase() : "PLIK";
}

export default function IdentifyForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedFiles = location.state?.selectedFiles || [];
  const splitBefore = location.state?.splitBefore || [];
  const startedRef = useRef(false);
  const [statuses, setStatuses] = useState(() =>
    selectedFiles.map(() => ({ state: "idle", message: "" }))
  );
  const [convertedForms, setConvertedForms] = useState([]);

  const formSections = selectedFiles.reduce((sections, file, index) => {
    const formNumber = 1 + splitBefore.filter((splitIndex) => index >= splitIndex).length;
    const section = sections.find((item) => item.formNumber === formNumber);
    if (section) section.files.push({ file, index });
    else sections.push({ formNumber, files: [{ file, index }] });
    return sections;
  }, []);

  async function processFiles(files) {
    setStatuses(files.map(() => ({ state: "idle", message: "" })));
    setConvertedForms([]);
    const results = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      setStatuses((current) =>
        current.map((status, index) =>
          index === fileIndex ? { state: "loading", message: "" } : status
        )
      );

      try {
        const convertedForm = await convertFormFile(file);
        const formNumber =
          1 + splitBefore.filter((splitIndex) => fileIndex >= splitIndex).length;
        const result = { fileName: file.name, convertedForm, formNumber };
        results.push(result);
        setConvertedForms([...results]);
        setStatuses((current) =>
          current.map((status, index) =>
            index === fileIndex ? { state: "success", message: "" } : status
          )
        );
      } catch (submitError) {
        setStatuses((current) =>
          current.map((status, index) =>
            index === fileIndex
              ? {
                  state: "error",
                  message:
                    submitError instanceof Error
                      ? submitError.message
                      : "Nie udało się przekonwertować formularza.",
                }
              : status
          )
        );
      }
    }
  }

  useEffect(() => {
    if (selectedFiles.length && !startedRef.current) {
      startedRef.current = true;
      processFiles(selectedFiles);
    }
  }, [selectedFiles]);

  const allFinished =
    statuses.length === selectedFiles.length &&
    statuses.every((status) => status.state === "success" || status.state === "error");

  const successfulFormNumbers = new Set(
    formSections
      .filter((section) =>
        section.files.every(({ index }) => statuses[index]?.state === "success")
      )
      .map((section) => section.formNumber)
  );
  const successfulConvertedForms = convertedForms.filter((item) =>
    successfulFormNumbers.has(item.formNumber)
  );
  const canOpenVerify = allFinished && successfulConvertedForms.length > 0;
  const hasErrors = statuses.some((status) => status.state === "error");

  function openVerify() {
    if (!canOpenVerify) return;
    navigate("/verify", {
      state: {
        fileName: successfulConvertedForms[0]?.fileName,
        convertedForm: successfulConvertedForms[0]?.convertedForm,
        convertedForms: successfulConvertedForms,
      },
    });
  }

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Wróć do przesyłania
          </Link>
        </Button>

        <Card className="shadow-lg shadow-foreground/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText aria-hidden="true" size={22} />
              </span>
              <div>
                <CardTitle className="text-xl">Cyfryzowanie formularzy</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Formularze są przetwarzane kolejno przez API
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {formSections.length ? (
              <div className="space-y-4">
                {formSections.map((section) => {
                  const finished = section.files.every(({ index }) =>
                    statuses[index]?.state === "success" || statuses[index]?.state === "error"
                  );
                  const successful = section.files.every(({ index }) =>
                    statuses[index]?.state === "success"
                  );

                  return (
                    <section key={section.formNumber} className="space-y-3">
                      <div className={`flex items-center gap-3 text-sm font-semibold ${
                        successful
                          ? "text-emerald-700"
                          : finished
                            ? "text-destructive"
                            : "text-primary"
                      }`}>
                        <span className={`h-px flex-1 ${
                          successful
                            ? "bg-emerald-300"
                            : finished
                              ? "bg-destructive/40"
                              : "bg-primary/30"
                        }`} />
                        Formularz {section.formNumber}
                        {successful ? " — OK" : finished ? " — nieprzekonwertowany" : " — w trakcie"}
                        <span className={`h-px flex-1 ${
                          successful
                            ? "bg-emerald-300"
                            : finished
                              ? "bg-destructive/40"
                              : "bg-primary/30"
                        }`} />
                      </div>

                      {section.files.map(({ file, index }) => {
                        const status = statuses[index] || { state: "idle", message: "" };
                        return (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}`}
                            className={`flex min-h-32 items-center gap-4 rounded-xl border p-4 sm:p-5 ${
                              status.state === "error"
                                ? "border-destructive/60 bg-destructive/5"
                                : status.state === "success"
                                  ? "border-emerald-300 bg-emerald-50/40"
                                  : "border-border bg-background"
                            }`}
                          >
                            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-primary">
                              {file.type.startsWith("image/") ? (
                                <Image aria-hidden="true" size={30} />
                              ) : (
                                <FileText aria-hidden="true" size={30} />
                              )}
                              <span className="absolute -bottom-1 right-1 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                                {getFileExtension(file)}
                              </span>
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold" title={file.name}>
                                {file.name}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              {status.state === "error" && (
                                <p className="mt-2 text-sm font-medium text-destructive" role="alert">
                                  {status.message}
                                </p>
                              )}
                              {status.state === "success" && (
                                <p className="mt-2 text-sm font-medium text-emerald-700">
                                  Cyfryzacja zakończona
                                </p>
                              )}
                            </div>
                            <div className="flex size-12 shrink-0 items-center justify-center">
                              {status.state === "loading" && (
                                <div className="loader" role="status" aria-label={`Cyfryzowanie pliku ${file.name}`} />
                              )}
                              {status.state === "success" && (
                                <CircleCheck aria-label="Powodzenie" className="text-emerald-600" size={38} />
                              )}
                              {status.state === "error" && (
                                <X aria-label="Niepowodzenie" className="text-destructive" size={38} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}

                {hasErrors && (
                  <Button type="button" variant="outline" className="w-full" onClick={() => processFiles(selectedFiles)}>
                    Spróbuj ponownie
                  </Button>
                )}
                <Button type="button" className="w-full" disabled={!canOpenVerify} onClick={openVerify}>
                  {canOpenVerify
                    ? "Przejdź do sprawdzenia i zatwierdzenia"
                    : "Oczekiwanie na zakończenie przetwarzania"}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Nie przekazano plików do cyfryzowania.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
