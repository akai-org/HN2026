import { CircleHelp, ScanText } from "lucide-react";
import { Link } from "react-router-dom";
import AccessibilityMenu from "./AccessibilityMenu.jsx";

export default function AppHeader({ onHelp, a11ySettings, onA11yChange, wide = false }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      {/* Cienki pasek u góry, jak w serwisach administracji. */}
      <div aria-hidden="true" className="h-1 bg-linear-to-r from-white from-50% to-(--kv-red) to-50%" />
      <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 ${wide ? "max-w-[1800px]" : "max-w-6xl"}`}>
        <Link to="/konwerter" className="flex min-w-0 items-center gap-3 rounded-xl">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#2a72d0] to-(--blue) text-white shadow-md shadow-blue-900/20">
            <ScanText aria-hidden="true" size={22} strokeWidth={2} />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-bold text-slate-900">Konwerter formularzy</span>
            <span className="block truncate text-[13px] text-slate-600">Papierowy wniosek → eUsługa</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <AccessibilityMenu settings={a11ySettings} onChange={onA11yChange} />
          <button
            type="button"
            onClick={onHelp}
            aria-haspopup="dialog"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
          >
            <CircleHelp aria-hidden="true" size={18} />
            <span className="sr-only sm:not-sr-only">Pomoc</span>
          </button>
        </div>
      </div>
    </header>
  );
}
