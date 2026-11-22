import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, FileText, Image, X } from "@/components/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertFormFile } from "@/lib/api";
import { keepFile, keepOnly } from "@/lib/fileStore";

function getFileExtension(file) {
  const extension = file.name.split(".").pop();
  return extension && extension !== file.name ? extension.toUpperCase() : "PLIK";
}

export default function IdentifyForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedFiles = useMemo(() => location.state?.selectedFiles || [], [location.state]);
  const splitBefore = useMemo(() => location.state?.splitBefore || [], [location.state]);
  const existingConvertedForms = useMemo(() => location.state?.convertedForms || [], [location.state]);
  const startedRef = useRef(false);
  const [convertedForms, setConvertedForms] = useState(existingConvertedForms);
  const [statuses, setStatuses] = useState(() =>
    selectedFiles.length
      ? selectedFiles.map(() => ({ state: "idle", message: "" }))
      : existingConvertedForms.map(() => ({ state: "success", message: "" }))
  );

  const processFiles = useCallback(async (files) => {
    setStatuses(files.map(() => ({ state: "idle", message: "" })));
    setConvertedForms([]);
    const results = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const selectedFile = files[fileIndex];
      setStatuses((current) =>
        current.map((status, index) =>
          index === fileIndex
            ? { state: "loading", message: "" }
            : status
        )
      );

      try {
        const convertedForm = await convertFormFile(selectedFile);
        const result = {
          fileName: selectedFile.name,
          fileId: keepFile(selectedFile),
          convertedForm,
          formNumber: 1 + splitBefore.filter((index) => fileIndex >= index).length,
        };
        results.push(result);
        setConvertedForms([...results]);
        setStatuses((current) =>
          current.map((status, index) =>
            index === fileIndex
              ? { state: "success", message: "" }
              : status
          )
        );
      } catch (submitError) {
        const message =
          submitError instanceof Error
            ? submitError.message
            : "Nie udało się przekonwertować formularza.";
        setStatuses((current) =>
          current.map((status, index) =>
            index === fileIndex
              ? { state: "error", message }
              : status
          )
        );
      }
    }
    keepOnly(results.map((result) => result.fileId));
  }, [splitBefore]);

  useEffect(() => {
    if (selectedFiles.length && !startedRef.current) {
      startedRef.current = true;
      processFiles(selectedFiles);
    }
  }, [processFiles, selectedFiles]);

  const formSections = selectedFiles.reduce((sections, file, index) => {
    const formNumber = 1 + splitBefore.filter((splitIndex) => index >= splitIndex).length;
    const section = sections.find((item) => item.formNumber === formNumber);
    if (section) section.files.push({ file, index });
    else sections.push({ formNumber, files: [{ file, index }] });
    return sections;
  }, []);
  const allFinished =
    selectedFiles.length > 0 &&
    statuses.length === selectedFiles.length &&
    statuses.every((status) =>
      status.state === "success" || status.state === "error"
    );
  const successfulFormSections = formSections.filter((section) =>
    section.files.every(({ index }) => statuses[index]?.state === "success")
  );
  const successfulFormNumbers = new Set(
    successfulFormSections.map((section) => section.formNumber)
  );
  const successfulConvertedForms = convertedForms.filter(
    (item) => successfulFormNumbers.has(item.formNumber)
  );
  const hasErrors = statuses.some((status) => status.state === "error");
  const canOpenVerify =
    (allFinished && successfulConvertedForms.length > 0) ||
    (selectedFiles.length === 0 && existingConvertedForms.length > 0);

  function openVerify() {
    if (!canOpenVerify) return;
    const formsToVerify =
      selectedFiles.length ? successfulConvertedForms : existingConvertedForms;
    navigate("/verify", {
      state: {
        fileName: formsToVerify[0]?.fileName,
        convertedForm: formsToVerify[0]?.convertedForm,
        convertedForms: formsToVerify,
      },
    });
  }
  const existingFormSections = existingConvertedForms.reduce((sections, item) => {
    const formNumber = item.formNumber || 1;
    const section = sections.find((existing) => existing.formNumber === formNumber);
    if (section) section.items.push(item);
    else sections.push({ formNumber, items: [item] });
    return sections;
  }, []);

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
            {selectedFiles.length ? (
              <div className="space-y-4">
                {formSections.map((section) => {
                  const sectionFinished = section.files.every(({ index }) =>
                    statuses[index]?.state === "success" || statuses[index]?.state === "error"
                  );
                  const sectionSuccessful = section.files.every(({ index }) =>
                    statuses[index]?.state === "success"
                  );
                  return (
                    <section
                      key={section.formNumber}
                      aria-label={`Formularz ${section.formNumber}`}
                      className="space-y-3"
                    >
                    <div className={`flex items-center gap-3 text-sm font-semibold ${
                      sectionSuccessful ? "text-emerald-700" : sectionFinished ? "text-destructive" : "text-primary"
                    }`}>
                      <span className={`h-px flex-1 ${
                        sectionSuccessful ? "bg-emerald-300" : sectionFinished ? "bg-destructive/40" : "bg-primary/30"
                      }`} />
                      Formularz {section.formNumber}
                      {sectionSuccessful
                        ? " — OK"
                        : sectionFinished
                          ? " — nieprzekonwertowany"
                          : " — w trakcie"}
                      <span className={`h-px flex-1 ${
                        sectionSuccessful ? "bg-emerald-300" : sectionFinished ? "bg-destructive/40" : "bg-primary/30"
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
            ) : existingConvertedForms.length ? (
              <div className="space-y-4">
                {existingFormSections.map((section) => (
                  <section key={section.formNumber} className="space-y-3" aria-label={`Formularz ${section.formNumber}`}>
                    <div className="flex items-center gap-3 text-sm font-semibold text-primary">
                      <span className="h-px flex-1 bg-primary/30" />
                      Formularz {section.formNumber}
                      <span className="h-px flex-1 bg-primary/30" />
                    </div>
                    {section.items.map((item, index) => (
                      <div key={`${item.fileName}-${index}`} className="flex min-h-32 items-center gap-4 rounded-xl border border-emerald-300 bg-emerald-50/40 p-5">
                        <CircleCheck className="text-emerald-600" size={38} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.fileName}</p>
                          <p className="mt-1 text-sm text-emerald-700">Cyfryzacja zakończona</p>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
                <Button type="button" className="w-full" onClick={openVerify}>
                  Przejdź do sprawdzenia i zatwierdzenia
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
