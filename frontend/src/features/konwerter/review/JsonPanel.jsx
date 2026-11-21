// Kolumna JSON: edytor kodu albo uproszczone drzewo, opis zaznaczonego pola, kopiowanie i pobieranie.
import { useId, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Copy, Download, FileUp, WandSparkles } from "lucide-react";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import { IconButton } from "../components/primitives.jsx";
import { copyText, downloadJson } from "../lib/download.js";
import { parseJson } from "../lib/jsonPositions.js";
import { stringifyForm } from "../lib/doc.js";
import FieldExplainer from "./FieldExplainer.jsx";
import JsonEditor from "./JsonEditor.jsx";
import StructureTree from "./StructureTree.jsx";

const VIEWS = [
  { id: "code", label: "Kod" },
  { id: "tree", label: "Struktura" },
];

export function JsonActions({ doc, title, onText, announce }) {
  const importRef = useRef(null);
  const canFormat = !doc.error && doc.text !== stringifyForm(doc.form);

  async function copy() {
    try {
      await copyText(doc.text);
      announce("Skopiowano JSON do schowka.");
    } catch {
      announce("Nie udało się skopiować. Zaznacz tekst w edytorze i użyj Ctrl + C.");
    }
  }

  async function importJson(file) {
    const text = await file.text();
    const parsed = parseJson(text);
    onText(parsed.error ? text : stringifyForm(parsed.value?.form && parsed.value?.tabs === undefined ? parsed.value.form : parsed.value));
    announce(parsed.error ? `Wczytano plik z błędem w linii ${parsed.error.line}.` : `Wczytano ${file.name}.`);
  }

  return (
    <span className="flex items-center">
      {canFormat && <IconButton label="Uporządkuj wcięcia" icon={WandSparkles} size={16} onClick={() => onText(stringifyForm(doc.form))} />}
      <IconButton label="Kopiuj JSON" icon={Copy} size={16} onClick={copy} />
      <IconButton label="Pobierz plik JSON" icon={Download} size={16} onClick={() => downloadJson(doc.text, title)} />
      <IconButton label="Wczytaj JSON z pliku" icon={FileUp} size={16} onClick={() => importRef.current?.click()} />
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          if (file) importJson(file);
          event.target.value = "";
        }}
      />
    </span>
  );
}

export default function JsonPanel({ doc, onText, selectedEntry, selectedState, highlight, onCursor, onSelect, titles, states }) {
  const [view, setView] = useState("code");
  const explainerId = useId();
  const statusId = useId();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div role="group" aria-label="Widok JSON" className="inline-flex rounded-xl bg-slate-100 p-1">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={`h-8 rounded-lg px-3 text-sm font-semibold transition ${
                view === option.id ? "bg-white text-(--blue) shadow-sm ring-1 ring-slate-200" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p id={statusId} role="status" className={`ml-auto inline-flex items-center gap-1.5 text-sm font-semibold ${doc.error ? "text-red-700" : "text-emerald-800"}`}>
          {doc.error ? <CircleAlert aria-hidden="true" size={16} /> : <CircleCheck aria-hidden="true" size={16} />}
          {doc.error ? `Błąd w linii ${doc.error.line}: ${doc.error.message}` : "Poprawny JSON"}
        </p>
      </div>
      {doc.error && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          Podgląd formularza pokazuje ostatnią poprawną wersję. Popraw błąd albo cofnij zmianę.
        </p>
      )}
      <ErrorBoundary resetKey={doc.text} title="Nie udało się opisać pola.">
        <FieldExplainer id={explainerId} entry={selectedEntry} titles={titles} state={selectedState} />
      </ErrorBoundary>
      <div className="min-h-0 flex-1">
        {view === "code" ? (
          <JsonEditor
            value={doc.text}
            onChange={onText}
            onCursor={onCursor}
            highlight={highlight}
            label="Kod JSON formularza. Zmiany od razu widać w podglądzie."
            describedBy={statusId}
          />
        ) : (
          <ErrorBoundary resetKey={doc.text} title="Nie udało się narysować struktury.">
            <StructureTree form={doc.form} selectedId={selectedEntry?.field.id} onSelect={onSelect} states={states} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
