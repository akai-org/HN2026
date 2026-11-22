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
const NO_KEYS = new Set();
const IDLE = { state: "idle" };
const SUCCESS = { state: "success" };

const isSettled = ({ state }) => state === "success" || state === "error";

export default function DigitalizeForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const files = state?.selectedFiles ?? NONE;
  const splitBefore = state?.splitBefore ?? NONE;
  const formNames = state?.formNames ?? NONE;
  const conversion = useConversion(files, splitBefore, formNames);
  const [removed, setRemoved] = useState(() => new Set());
  const [notice, setNotice] = useState("");
  const headingRef = useRef(null);

  // New files come from the upload step; coming back from the verify step brings only the earlier results.
  const isNewRun = files.length > 0;
  const results = isNewRun ? conversion.results : (state?.convertedForms ?? NONE);
  const allRows = isNewRun
    ? files.map((file, index) => ({
        key: fileKey(file),
        file,
        formNumber: formNumberAt(index, splitBefore),
        formName: formNames[formNumberAt(index, splitBefore) - 1] ?? "",
        status: conversion.statuses[index] ?? IDLE,
        resultIndex: results.findIndex((result) => getFile(result.fileId) === file),
      }))
    : results.map((result, index) => ({
        key: result.fileId ?? index,
        file: getFile(result.fileId) ?? { name: result.fileName },
        formNumber: result.formNumber ?? 1,
        formName: result.formName ?? "",
        status: SUCCESS,
        resultIndex: index,
      }));
  const rows = allRows.filter((row) => !removed.has(row.key));

  /** Hides a failed file. With no files left there is nothing to digitalize, so we go back to the upload step. */
  function removeRow(row) {
    const next = new Set(removed).add(row.key);
    setRemoved(next);
    if (allRows.every((candidate) => next.has(candidate.key))) {
      navigate("/", { replace: true });
      return;
    }
    setNotice(`Usunięto plik ${row.file.name} z listy.`);
    headingRef.current?.focus();
  }

  const isFinished = rows.every(({ status }) => isSettled(status));
  const canContinue = isFinished && results.length > 0;

  /** Opens the comparison at one file; the others stay available there (file previews at the top). */
  function openResult(index) {
    navigate("/verify", { state: { convertedForms: results, current: index } });
  }
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
                  <h1 ref={headingRef} tabIndex={-1} className="outline-none">
                    Cyfryzowanie formularzy
                  </h1>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Formularze są przetwarzane kolejno przez API
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <p role="status" className="sr-only">
              {notice}
            </p>
            {rows.length === 0 ? (
              <p className="text-muted-foreground">Nie przekazano plików do cyfryzowania.</p>
            ) : (
              <div className="space-y-4">
                {[...Map.groupBy(rows, (row) => row.formNumber)].map(([formNumber, formRows]) => (
                  <FormGroup
                    key={formNumber}
                    formNumber={formNumber}
                    rows={formRows}
                    onRemove={removeRow}
                    onOpen={canContinue ? openResult : null}
                  />
                ))}

                {hasErrors && (
                  <Button variant="outline" className="w-full" onClick={() => conversion.retry(removed)}>
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
 * `results` holds the successful conversions; `retry(skip)` runs the files again, except those whose
 * key (fileKey) is in `skip` (removed from the list).
 */
function useConversion(files, splitBefore, formNames) {
  const [statuses, setStatuses] = useState(() => files.map(() => IDLE));
  const [results, setResults] = useState([]);
  const hasStarted = useRef(false);

  const run = useCallback(async (skip = NO_KEYS) => {
    const isActive = (file) => !skip.has(fileKey(file));
    setStatuses((current) => files.map((file, index) => (isActive(file) ? IDLE : (current[index] ?? IDLE))));
    setResults([]);
    const converted = [];

    for (const [index, file] of files.entries()) {
      if (!isActive(file)) continue;
      const setStatus = (status) => setStatuses((current) => current.with(index, status));
      setStatus({ state: "loading" });
      try {
        const convertedForm = await convertFormFile(file);
        converted.push({
          fileName: file.name,
          fileId: keepFile(file),
          convertedForm,
          formNumber: formNumberAt(index, splitBefore),
          formName: formNames[formNumberAt(index, splitBefore) - 1] ?? "",
        });
        setResults([...converted]);
        setStatus(SUCCESS);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nie udało się przekonwertować formularza.";
        setStatus({ state: "error", message });
      }
    }
    keepOnly(converted.map((result) => result.fileId));
  }, [files, splitBefore, formNames]);

  // Start once: React runs effects twice in development, and a conversion is slow and costs an LLM call.
  useEffect(() => {
    if (!files.length || hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [files, run]);

  return { statuses, results, retry: run };
}

function FormGroup({ formNumber, rows, onRemove, onOpen }) {
  const isDone = rows.every(({ status }) => status.state === "success");
  const isFailed = !isDone && rows.every(({ status }) => isSettled(status));
  const [label, tone] = isDone
    ? ["OK", "text-success"]
    : isFailed
      ? ["nieprzekonwertowany", "text-destructive"]
      : ["w trakcie", "text-primary"];

  return (
    <section aria-label={rows[0]?.formName || `Formularz ${formNumber}`} className="space-y-3">
      <Divider className={cn("text-sm", tone)}>
        {rows[0]?.formName || `Formularz ${formNumber}`} — {label}
      </Divider>
      {rows.map((row) => (
        <ConversionRow
          key={row.key}
          file={row.file}
          status={row.status}
          onRemove={() => onRemove(row)}
          onOpen={onOpen && row.resultIndex >= 0 ? () => onOpen(row.resultIndex) : null}
        />
      ))}
    </section>
  );
}

const ROW_TONES = {
  success: "border-success/40 bg-success/5",
  error: "border-destructive/60 bg-destructive/5",
};

function ConversionRow({ file, status, onRemove, onOpen }) {
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
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Usuń plik ${file.name} z listy`}
              title="Usuń z listy"
              className="flex size-12 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-destructive/40"
            >
              <X size={36} />
            </button>
          )}
        </div>
      }
    >
      {status.state === "success" && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-success">
          Cyfryzacja zakończona
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="rounded-sm text-primary underline underline-offset-2 hover:no-underline focus-ring"
            >
              Sprawdź ten formularz
            </button>
          )}
        </p>
      )}
      {status.state === "error" && (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {status.message}
        </p>
      )}
    </FileRow>
  );
}
