// Podgląd formularza na żywo: rysowany wprost z JSON-a, z działającymi warunkami (JSONata).
import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { asArray, tabsInOrder } from "../lib/formModel.js";
import { IconButton } from "../components/primitives.jsx";
import { Questions } from "./EuField.jsx";
import { PreviewContext } from "./previewContext.js";

/** Zwarta nawigacja po stronach formularza: poprzednia / lista stron / następna. */
function PageNav({ tabs, current, onPage }) {
  const selectId = useId();
  return (
    <nav aria-label="Strony formularza" className="flex items-center gap-1">
      <IconButton label="Poprzednia strona formularza" icon={ChevronLeft} onClick={() => onPage(current - 1)} disabled={current === 0} />
      <label htmlFor={selectId} className="sr-only">
        Strona formularza
      </label>
      <select
        id={selectId}
        value={current}
        onChange={(event) => onPage(Number(event.target.value))}
        className="h-9 min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 focus:border-(--blue)"
      >
        {tabs.map(({ tab }, position) => (
          <option key={tab.id ?? position} value={position}>
            {position + 1}/{tabs.length} · {tab.title || `Strona ${position + 1}`}
          </option>
        ))}
      </select>
      <IconButton label="Następna strona formularza" icon={ChevronRight} onClick={() => onPage(current + 1)} disabled={current >= tabs.length - 1} />
    </nav>
  );
}

/**
 * page: pozycja strony w kolejności z flow (0…). Sterowana z zewnątrz, bo zaznaczenie pola
 * w JSON-ie albo w drzewie przełącza podgląd na stronę, na której to pole leży.
 */
export default function FormPreview({ form, page, onPage, context }) {
  const tabs = tabsInOrder(form);
  const current = Math.min(Math.max(page, 0), Math.max(tabs.length - 1, 0));
  const entry = tabs[current];
  const headingRef = useRef(null);
  const wantFocus = useRef(false);

  // Po zmianie strony przyciskiem fokus trafia na jej nagłówek; zmiana z zewnątrz fokusu nie zabiera.
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    headingRef.current?.focus();
  }, [current]);

  if (!entry) {
    return <p className="p-6 text-sm text-slate-600">Formularz nie ma żadnej strony do pokazania.</p>;
  }

  const go = (position) => {
    wantFocus.current = true;
    onPage(Math.min(Math.max(position, 0), tabs.length - 1));
  };

  return (
    <PreviewContext.Provider value={context}>
      <div className="eu-preview min-h-full bg-[#f0f4f8]">
        {tabs.length > 1 && (
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur">
            <PageNav tabs={tabs} current={current} onPage={go} />
          </div>
        )}
        <div className="mx-auto max-w-[760px] px-3 py-5 sm:px-5">
          <h3 className="text-2xl font-bold text-balance text-slate-900">{form.title || "Formularz bez tytułu"}</h3>
          <h4 ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-bold text-slate-900 outline-none">
            <span className="sr-only">
              Strona {current + 1} z {tabs.length}:{" "}
            </span>
            {entry.tab.title || `Strona ${current + 1}`}
          </h4>
          <div className="mt-3">
            {asArray(entry.tab.questions).length === 0 ? (
              <p className="rounded-lg bg-white p-5 text-sm text-slate-600">Ta strona nie ma pól.</p>
            ) : (
              <Questions questions={asArray(entry.tab.questions)} />
            )}
          </div>
        </div>
      </div>
    </PreviewContext.Provider>
  );
}
