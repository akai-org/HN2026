import { Check, CircleHelp, ScanText } from "lucide-react";
import { STEPS } from "./files.js";

function Stepper({ activeStep }) {
  return (
    <ol aria-label="Postęp" className="hidden items-center gap-3 md:flex">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === activeStep;
        const isDone = step < activeStep;
        return (
          <li key={label} className="flex items-center gap-3">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`h-0.5 w-6 rounded-full transition-colors lg:w-10 ${
                  step <= activeStep ? "bg-(--blue)" : "bg-slate-200"
                }`}
              />
            )}
            <span aria-current={isActive ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? "bg-(--blue) text-white ring-4 ring-(--blue-soft)"
                    : isDone
                      ? "bg-(--blue-soft) text-(--blue)"
                      : "bg-white text-slate-500 ring-1 ring-slate-200"
                }`}
              >
                {isDone ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : step}
                {isDone && <span className="sr-only">Ukończono: </span>}
              </span>
              <span
                className={`text-sm ${
                  isActive ? "font-semibold text-slate-900" : "hidden text-slate-500 lg:inline"
                }`}
              >
                {label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function MockupHeader({ activeStep, onHelp }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#2a72d0] to-(--blue) text-white shadow-md shadow-blue-900/20">
            <ScanText aria-hidden="true" size={22} strokeWidth={2} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold text-slate-900">Konwerter formularzy</p>
            <p className="truncate text-[13px] text-slate-500">Papierowy wniosek → eUsługa</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 lg:gap-8">
          <Stepper activeStep={activeStep} />
          <button
            type="button"
            onClick={onHelp}
            aria-haspopup="dialog"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue) sm:px-3.5"
          >
            <CircleHelp aria-hidden="true" size={17} />
            <span className="sr-only sm:not-sr-only">Pomoc</span>
          </button>
        </div>
      </div>
    </header>
  );
}
