// Podgląd formularza na żywo: rysowany wprost z JSON-a, z działającymi warunkami (JSONata).
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { asArray, tabsInOrder } from "../lib/formModel.js";
import { Questions } from "./EuField.jsx";
import { PreviewContext } from "./previewContext.js";

function Steps({ tabs, current, onPage }) {
  return (
    <nav aria-label="Strony formularza" className="mt-4">
      <ol className="flex flex-wrap gap-2">
        {tabs.map(({ tab }, position) => {
          const active = position === current;
          const done = position < current;
          return (
            <li key={tab.id ?? position}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onPage(position)}
                className={`inline-flex h-9 items-center gap-2 rounded-full border-2 pr-3 pl-1 text-sm font-semibold transition ${
                  active ? "border-(--blue) bg-white text-(--blue)" : "border-transparent bg-white/70 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                    active ? "bg-(--blue) text-white" : done ? "bg-(--blue-soft) text-(--blue)" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {done ? <Check aria-hidden="true" size={13} strokeWidth={3} /> : position + 1}
                </span>
                {tab.title || `Strona ${position + 1}`}
              </button>
            </li>
          );
        })}
      </ol>
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

  // Po kliknięciu „Dalej” fokus trafia na nagłówek nowej strony (jak w eUsłudze).
  // Zmiana strony z zewnątrz (zaznaczenie pola w JSON-ie) fokusu nie zabiera.
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
    onPage(position);
  };

  return (
    <PreviewContext.Provider value={context}>
      <div className="eu-preview min-h-full bg-[#f0f4f8] px-3 py-5 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <p className="text-xs font-bold tracking-wide text-slate-600 uppercase">Tak zobaczy to mieszkaniec · eUsługa</p>
          <h3 className="mt-1 text-2xl font-bold text-balance text-slate-900">{form.title || "Formularz bez tytułu"}</h3>
          {tabs.length > 1 && <Steps tabs={tabs} current={current} onPage={go} />}

          <h4 ref={headingRef} tabIndex={-1} className="mt-6 text-xl font-bold text-slate-900 outline-none">
            <span className="sr-only">
              Strona {current + 1} z {tabs.length}:{" "}
            </span>
            {entry.tab.title || `Strona ${current + 1}`}
          </h4>

          <div className="mt-3">
            {asArray(entry.tab.questions).length === 0 ? (
              <p className="rounded-lg bg-white p-5 text-sm text-slate-600">Ta strona nie ma jeszcze pól.</p>
            ) : (
              <Questions questions={asArray(entry.tab.questions)} />
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-slate-300 pt-5">
            <button
              type="button"
              onClick={() => go(current - 1)}
              disabled={current === 0}
              className="inline-flex h-11 items-center gap-2 rounded-md border-2 border-(--blue) bg-white px-4 font-semibold text-(--blue) transition hover:bg-(--blue-soft) disabled:invisible"
            >
              <ArrowLeft aria-hidden="true" size={18} /> Wstecz
            </button>
            {current < tabs.length - 1 && (
              <button
                type="button"
                onClick={() => go(current + 1)}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-(--blue) px-5 font-semibold text-white transition hover:bg-(--blue-hover)"
              >
                Dalej <ArrowRight aria-hidden="true" size={18} />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-600">To podgląd: wpisane dane nigdzie nie trafiają, służą tylko do sprawdzenia warunków.</p>
        </div>
      </div>
    </PreviewContext.Provider>
  );
}
