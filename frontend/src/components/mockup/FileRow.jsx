import { ArrowRight, CircleAlert, CircleCheck, Clock, LoaderCircle, RotateCcw, X } from "lucide-react";
import { countQuestions, fileTypeOf, formatSize, plural } from "./files.js";

function StatusBadge({ item, now }) {
  switch (item.status) {
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <Clock aria-hidden="true" size={14} /> W kolejce
        </span>
      );
    case "processing": {
      const seconds = Math.max(0, Math.round((now - item.startedAt) / 1000));
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-(--blue)">
          <LoaderCircle aria-hidden="true" size={14} className="motion-safe:animate-spin" />
          Rozpoznawanie… {seconds} s
        </span>
      );
    }
    case "done":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <CircleCheck aria-hidden="true" size={14} /> Rozpoznano
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-red-600">
          <CircleAlert aria-hidden="true" size={14} /> Nie udało się
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-slate-400" /> Gotowy do rozpoznania
        </span>
      );
  }
}

function Thumbnail({ item }) {
  const type = fileTypeOf(item.file);
  if (item.previewUrl) {
    return (
      <img
        src={item.previewUrl}
        alt=""
        className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 sm:size-12"
      />
    );
  }
  const Icon = type.icon;
  return (
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 sm:size-12 ${type.tone}`}>
      <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
    </span>
  );
}

export default function FileRow({ item, now, onRemove, onRetry, onReview }) {
  const type = fileTypeOf(item.file);
  const isBusy = item.status === "processing";
  const result = item.result;
  const questions = result ? countQuestions(result.form) : 0;
  const warnings = result?.warnings?.length ?? 0;

  let action = null;
  if (item.status === "done") {
    action = (
      <button
        type="button"
        onClick={() => onReview(item)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--blue-soft) px-3 text-sm font-semibold text-(--blue) transition hover:bg-(--blue-ring)/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
      >
        Przejrzyj <ArrowRight aria-hidden="true" size={16} />
      </button>
    );
  } else if (item.status === "error") {
    action = (
      <button
        type="button"
        onClick={() => onRetry(item)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
      >
        <RotateCcw aria-hidden="true" size={15} /> Spróbuj ponownie
      </button>
    );
  }

  // Siatka: na telefonie akcja schodzi pod opis, na szerszym ekranie stoi w jednym rzędzie.
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 px-4 py-4 motion-safe:animate-[mk-rise-in_240ms_ease-out] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-4 sm:px-5">
      <Thumbnail item={item} />

      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
          <span>{type.label}</span>
          <span aria-hidden="true">·</span>
          <span>{formatSize(item.file.size)}</span>
          <span aria-hidden="true">·</span>
          <StatusBadge item={item} now={now} />
        </p>

        {isBusy && (
          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-(--blue-soft)"
            role="progressbar"
            aria-label={`Rozpoznawanie pliku ${item.file.name}`}
          >
            <div className="h-full w-1/3 rounded-full bg-(--blue) motion-safe:animate-[mk-indeterminate_1.4s_ease-in-out_infinite]" />
          </div>
        )}

        {item.status === "error" && <p className="mt-1.5 text-sm text-red-700">{item.error}</p>}

        {item.status === "done" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            {result.form?.title && <span className="font-semibold">{result.form.title}</span>}
            <span className="text-slate-500">
              {questions} {plural(questions, ["pole", "pola", "pól"])}
            </span>
            {warnings > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                {warnings} {plural(warnings, ["uwaga", "uwagi", "uwag"])} do sprawdzenia
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(item)}
        disabled={isBusy}
        aria-label={`Usuń plik ${item.file.name}`}
        title="Usuń plik"
        className="col-start-3 row-start-1 -mt-1 -mr-1 flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-(--blue) disabled:pointer-events-none disabled:opacity-30 sm:col-start-4 sm:m-0"
      >
        <X aria-hidden="true" size={18} />
      </button>

      {action && <div className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">{action}</div>}
    </li>
  );
}
