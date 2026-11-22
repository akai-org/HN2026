import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Divider from "@/components/Divider";
import FileRow from "@/components/FileRow";
import { ChevronLeft, CircleCheck, FileText, X } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertFormFile } from "@/lib/api";
import { getFile, keepFile, keepOnly } from "@/lib/fileStore";
import { fileKey, formNumberAt } from "@/lib/uploads";
import { cn } from "@/lib/utils";

const NONE = [];
const IDLE = { state: "idle" };
const SUCCESS = { state: "success" };

const isSettled = ({ state }) => state === "success" || state === "error";

export default function DigitalizeForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const files = state?.selectedFiles ?? NONE;
  const splitBefore = state?.splitBefore ?? NONE;
  const conversion = useConversion(files, splitBefore);

  // New files come from the upload step; coming back from the verify step brings only the earlier results.
  const isNewRun = files.length > 0;
  const results = isNewRun ? conversion.results : (state?.convertedForms ?? NONE);
  const rows = isNewRun
    ? files.map((file, index) => ({
        key: fileKey(file),
        file,
        formNumber: formNumberAt(index, splitBefore),
        status: conversion.statuses[index] ?? IDLE,
      }))
    : results.map((result, index) => ({
        key: result.fileId ?? index,
        file: getFile(result.fileId) ?? { name: result.fileName },
        formNumber: result.formNumber ?? 1,
        status: SUCCESS,
      }));

  const isFinished = rows.every(({ status }) => isSettled(status));
  const canContinue = isFinished && results.length > 0;
  const hasErrors = rows.some(({ status }) => status.state === "error");

  return (
    <div className="px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "mb-6" })}>
          <ChevronLeft />
          Wróć do przesyłania
        </Link>

        <Card className="shadow-lg shadow-foreground/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText size={22} />
              </span>
              <div>
                <CardTitle className="text-xl">
                  <h1>Cyfryzowanie formularzy</h1>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Formularze są przetwarzane kolejno przez API
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {rows.length === 0 ? (
              <p className="text-muted-foreground">Nie przekazano plików do cyfryzowania.</p>
            ) : (
              <div className="space-y-4">
                {[...Map.groupBy(rows, (row) => row.formNumber)].map(([formNumber, formRows]) => (
                  <FormGroup key={formNumber} formNumber={formNumber} rows={formRows} />
                ))}

                {hasErrors && (
                  <Button variant="outline" className="w-full" onClick={conversion.retry}>
                    Spróbuj ponownie
                  </Button>
                )}
                <Button
                  className="w-full"
                  disabled={!canContinue}
                  onClick={() => navigate("/verify", { state: { convertedForms: results } })}
                >
                  {canContinue
                    ? "Przejdź do sprawdzenia i zatwierdzenia"
                    : isFinished
                      ? "Żaden formularz nie został przekonwertowany"
                      : "Oczekiwanie na zakończenie przetwarzania"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Sends the files to the backend one by one (in order, so the list fills from the top) and tracks each one.
 * `results` holds the successful conversions; `retry` runs all files again.
 */
function useConversion(files, splitBefore) {
  const [statuses, setStatuses] = useState(() => files.map(() => IDLE));
  const [results, setResults] = useState([]);
  const hasStarted = useRef(false);

  const run = useCallback(async () => {
    setStatuses(files.map(() => IDLE));
    setResults([]);
    const converted = [];

    for (const [index, file] of files.entries()) {
      const setStatus = (status) => setStatuses((current) => current.with(index, status));
      setStatus({ state: "loading" });
      try {
        const convertedForm = await convertFormFile(file);
        converted.push({
          fileName: file.name,
          fileId: keepFile(file),
          convertedForm,
          formNumber: formNumberAt(index, splitBefore),
        });
        setResults([...converted]);
        setStatus(SUCCESS);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nie udało się przekonwertować formularza.";
        setStatus({ state: "error", message });
      }
    }
    keepOnly(converted.map((result) => result.fileId));
  }, [files, splitBefore]);

  // Start once: React runs effects twice in development, and a conversion is slow and costs an LLM call.
  useEffect(() => {
    if (!files.length || hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [files, run]);

  return { statuses, results, retry: run };
}

function FormGroup({ formNumber, rows }) {
  const isDone = rows.every(({ status }) => status.state === "success");
  const isFailed = !isDone && rows.every(({ status }) => isSettled(status));
  const [label, tone] = isDone
    ? ["OK", "text-success"]
    : isFailed
      ? ["nieprzekonwertowany", "text-destructive"]
      : ["w trakcie", "text-primary"];

  return (
    <section aria-label={`Formularz ${formNumber}`} className="space-y-3">
      <Divider className={cn("text-sm", tone)}>
        Formularz {formNumber} — {label}
      </Divider>
      {rows.map(({ key, file, status }) => (
        <ConversionRow key={key} file={file} status={status} />
      ))}
    </section>
  );
}

const ROW_TONES = {
  success: "border-success/40 bg-success/5",
  error: "border-destructive/60 bg-destructive/5",
};

function ConversionRow({ file, status }) {
  return (
    <FileRow
      file={file}
      className={ROW_TONES[status.state]}
      action={
        <div className="flex size-12 shrink-0 items-center justify-center">
          {status.state === "loading" && (
            <div className="loader" role="status" aria-label={`Cyfryzowanie pliku ${file.name}`} />
          )}
          {status.state === "success" && (
            <CircleCheck size={36} aria-label="Powodzenie" className="text-success" />
          )}
          {status.state === "error" && (
            <X size={36} aria-label="Niepowodzenie" className="text-destructive" />
          )}
        </div>
      }
    >
      {status.state === "success" && (
        <p className="mt-2 text-sm font-medium text-success">Cyfryzacja zakończona</p>
      )}
      {status.state === "error" && (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {status.message}
        </p>
      )}
    </FileRow>
  );
}
