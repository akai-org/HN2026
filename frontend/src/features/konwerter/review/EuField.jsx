// Pola w stylu eUsługi: każde pole z JSON-a rysujemy tak, jak zobaczy je mieszkaniec,
// i dokładamy objaśnienia dla urzędnika (rejestr, warunek, słownik).
import { useId, useRef, useState } from "react";
import { Database, EyeOff, GitBranch, Info, List, Paperclip, Plus, Trash2 } from "lucide-react";
import { describeQuery } from "../lib/conditions.js";
import { asArray, childQuestions, isAutoFilled, isContainerType, isRequired, orderedIndexes, typeLabel } from "../lib/formModel.js";
import { sanitizeHtml } from "../lib/html.js";
import { TERYT_LEVELS, dictionaryInfo, registrySourceLabel, terytChildren } from "../lib/registry.js";
import { Badge } from "../components/primitives.jsx";
import FieldToolbar from "./FieldToolbar.jsx";
import { usePreview } from "./previewContext.js";

const inputBase =
  "block w-full rounded-md border-2 bg-white px-3 text-[15px] text-slate-900 transition placeholder:text-slate-500 focus:border-(--blue) focus:outline-none";

function inputClass(readOnly) {
  return `${inputBase} ${readOnly ? "border-slate-300 bg-slate-100 text-slate-700" : "border-slate-500"}`;
}

function Rich({ html, id, className = "" }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return <div id={id} className={`eu-rich text-sm text-slate-700 ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

function RequiredMark({ field, required }) {
  if (!required && !isRequired(field)) return null;
  return <span className="ml-1 font-normal text-slate-700">(wymagane)</span>;
}

/** Objaśnienia dla urzędnika: skąd wartość, kiedy pole się pokazuje, jaki słownik. */
function Notes({ field, state }) {
  const { showNotes, titles } = usePreview();
  if (!showNotes) return null;
  const notes = [];
  if (isAutoFilled(field)) notes.push(<Badge key="auto" tone="green" icon={Database}>Z {registrySourceLabel(field.defaultValue) || "rejestru"}</Badge>);
  for (const [index, condition] of asArray(field.states).entries()) {
    if (condition?.type !== "SHOW") continue;
    const text = describeQuery(condition.query, titles);
    notes.push(
      <Badge key={`c${index}`} tone="violet" icon={GitBranch} className="max-w-full rounded-xl text-left whitespace-normal">
        <span className="min-w-0">Pokazuje się, gdy {text ?? "spełniony jest warunek"}</span>
      </Badge>,
    );
  }
  if (state && !state.visible) notes.push(<Badge key="hidden" icon={EyeOff}>Teraz ukryte</Badge>);
  if (field.dictionaryName) notes.push(<Badge key="dict" tone="blue" icon={List}>Słownik: {dictionaryInfo(field.dictionaryName).label}</Badge>);
  if (notes.length === 0) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{notes}</div>;
}

function Label({ field, htmlFor, as = "label", required }) {
  const { renamingId } = usePreview();
  if (renamingId === field.id) return <FieldToolbar.RenameInput field={field} />;
  const Tag = as;
  const props = as === "label" ? { htmlFor } : {};
  return (
    <Tag {...props} className="block text-[15px] font-bold text-slate-900">
      {field.title || <span className="font-normal text-slate-500 italic">Pole bez etykiety</span>}
      <RequiredMark field={field} required={required} />
    </Tag>
  );
}

function TerytSelect({ field, value, onChange, readOnly, describedBy }) {
  const selected = Array.isArray(value) ? value : [];
  const levels = TERYT_LEVELS.map((label, level) => ({
    label,
    options: level === 0 ? dictionaryInfo(field.dictionaryName).values : terytChildren(selected.slice(0, level)),
  }));
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      {levels.map(({ label, options }, level) => {
        const id = `eu-${field.id}-${level}`;
        const disabled = readOnly || (level > 0 && !selected[level - 1]);
        return (
          <div key={label}>
            <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">
              {label}
            </label>
            <select
              id={id}
              value={selected[level] ?? ""}
              disabled={disabled}
              aria-describedby={describedBy}
              onChange={(event) => onChange([...selected.slice(0, level), event.target.value].filter(Boolean))}
              className={`${inputClass(disabled)} h-11`}
            >
              <option value="">{options.length || level === 0 ? "Wybierz" : "Brak danych w przykładzie"}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function FileInput({ field, readOnly, describedBy }) {
  const [name, setName] = useState("");
  const ref = useRef(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed border-slate-400 bg-white px-4 py-3">
      <Paperclip aria-hidden="true" size={18} className="text-slate-600" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{name || "Nie wybrano pliku"}</span>
      <button
        type="button"
        disabled={readOnly}
        aria-describedby={describedBy}
        onClick={() => ref.current?.click()}
        className="h-10 rounded-md border-2 border-(--blue) px-3 text-sm font-semibold text-(--blue) hover:bg-(--blue-soft)"
      >
        Dodaj plik<span className="sr-only">: {field.title}</span>
      </button>
      <input ref={ref} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => setName(event.target.files?.[0]?.name ?? "")} />
    </div>
  );
}

function Control({ field, state, idSuffix = "" }) {
  const { answers, setAnswer } = usePreview();
  const key = `${field.id}${idSuffix}`;
  const value = answers[key];
  const id = `eu-${key}`;
  const descriptionId = `${id}-opis`;
  const readOnly = Boolean(state?.readOnly);
  const hasDescription = Boolean(sanitizeHtml(field.description));
  const describedBy = hasDescription ? descriptionId : undefined;
  const set = (next) => setAnswer(key, next);
  const required = state?.required;

  switch (field.type) {
    case "TEXT_BLOCK":
      return <Rich html={field.description} className="text-[15px] text-slate-800" />;
    case "INFO_SECTION":
      return (
        <div className="flex gap-3 rounded-md border-l-4 border-(--blue) bg-(--blue-soft) px-4 py-3">
          <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-(--blue)" />
          <div>
            {field.title && <p className="font-bold text-slate-900">{field.title}</p>}
            <Rich html={field.description} className="text-slate-800" />
          </div>
        </div>
      );
    case "RADIO":
    case "CHECKBOX": {
      const options = asArray(field.options);
      const multiple = field.type === "CHECKBOX";
      const list = multiple ? (Array.isArray(value) ? value : []) : value;
      return (
        <fieldset aria-describedby={describedBy}>
          <legend className="contents">
            <Label field={field} as="span" required={required} />
          </legend>
          <Rich html={field.description} id={descriptionId} className="mt-1" />
          <Notes field={field} state={state} />
          <div className="mt-2 space-y-2">
            {options.length === 0 && <p className="text-sm text-slate-600 italic">Brak opcji{field.dictionaryName ? ` (słownik ${field.dictionaryName})` : ""}</p>}
            {options.map((option, index) => {
              const optionId = `${id}-${index}`;
              const checked = multiple ? list.includes(option.name) : list === option.name;
              return (
                <label key={option.id ?? index} htmlFor={optionId} className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-900">
                  <input
                    id={optionId}
                    type={multiple ? "checkbox" : "radio"}
                    name={id}
                    checked={checked}
                    disabled={readOnly}
                    onChange={() => (multiple ? set(checked ? list.filter((name) => name !== option.name) : [...list, option.name]) : set(option.name))}
                    className="mt-0.5 size-5 shrink-0 accent-(--blue)"
                  />
                  <span>{option.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case "CONSENT_SECTION": {
      const consents = asArray(field.consentSectionConfig?.consents);
      const checks = Array.isArray(value) ? value : consents.map(() => false);
      return (
        <fieldset>
          <legend className="sr-only">{field.title || "Zgody"}</legend>
          <div className="space-y-3">
            {consents.map((consent, index) => {
              const consentId = `${id}-${index}`;
              return (
                <div key={index} className="flex items-start gap-3">
                  <input
                    id={consentId}
                    type="checkbox"
                    checked={Boolean(checks[index])}
                    disabled={readOnly}
                    onChange={() => set(checks.map((checkValue, i) => (i === index ? !checkValue : checkValue)))}
                    className="mt-1 size-5 shrink-0 accent-(--blue)"
                  />
                  <label htmlFor={consentId} className="text-[15px] text-slate-900">
                    <span className="eu-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(consent.description) || "Zgoda" }} />
                    {consent.required && <span className="ml-1 text-slate-700">(wymagane)</span>}
                  </label>
                </div>
              );
            })}
          </div>
          <Notes field={field} state={state} />
        </fieldset>
      );
    }
    default:
      break;
  }

  let input;
  if (field.type === "SELECT" && field.dictionaryName && dictionaryInfo(field.dictionaryName).tree && field.multiLevelTree !== false) {
    input = <TerytSelect field={field} value={value} onChange={set} readOnly={readOnly} describedBy={describedBy} />;
  } else if (field.type === "SELECT") {
    const options = field.dictionaryName ? dictionaryInfo(field.dictionaryName).values : asArray(field.options).map((option) => option?.name).filter(Boolean);
    const current = Array.isArray(value) ? value[0] ?? "" : value ?? "";
    input = (
      <select id={id} value={current} disabled={readOnly} aria-describedby={describedBy} onChange={(event) => set(event.target.value ? [event.target.value] : [])} className={`${inputClass(readOnly)} mt-2 h-11`}>
        <option value="">Wybierz</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "TEXTAREA") {
    input = <textarea id={id} rows={4} value={value ?? ""} readOnly={readOnly} aria-describedby={describedBy} onChange={(event) => set(event.target.value)} className={`${inputClass(readOnly)} mt-2 py-2`} />;
  } else if (field.type === "FILE_UPLOADER") {
    input = <FileInput field={field} readOnly={readOnly} describedBy={describedBy} />;
  } else {
    const type = field.type === "DATEPICKER" ? "date" : "text";
    input = (
      <input
        id={id}
        type={type}
        inputMode={field.type === "NUMBER" ? "decimal" : undefined}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        readOnly={readOnly}
        aria-describedby={describedBy}
        onChange={(event) => set(event.target.value)}
        className={`${inputClass(readOnly)} mt-2 h-11`}
      />
    );
  }

  return (
    <>
      <Label field={field} htmlFor={field.type === "FILE_UPLOADER" ? undefined : id} as={field.type === "FILE_UPLOADER" ? "p" : "label"} required={required} />
      {field.tooltipMessage && <p className="mt-0.5 text-sm text-slate-600">{field.tooltipMessage}</p>}
      <Rich html={field.description} id={descriptionId} className="mt-1" />
      <Notes field={field} state={state} />
      {input}
      {!["TEXT_FIELD", "NUMBER", "TEXTAREA", "DATEPICKER", "SELECT", "FILE_UPLOADER"].includes(field.type) && (
        <p className="mt-2 text-sm text-slate-600">Nieznany rodzaj pola: {typeLabel(field.type)}</p>
      )}
    </>
  );
}

/** Ramka pola: zaznaczanie wskaźnikiem lub fokusem i pływający pasek edycji. */
function FieldFrame({ field, state, children, className = "" }) {
  const { selectedId, onSelect, flashId } = usePreview();
  const selected = field.id === selectedId;
  // Reaguje tylko najgłębsza ramka (pole w sekcji, a nie cała sekcja). Zaznaczamy już przy
  // wciśnięciu, zanim pojawi się pasek, żeby kliknięcie trafiło tam, gdzie celował urzędnik.
  const select = (event) => {
    if (selected || event.target.closest(".eu-field") !== event.currentTarget) return;
    onSelect(field.id);
  };
  return (
    <div
      data-field-id={field.id}
      data-selected={selected}
      data-hidden={state ? !state.visible : false}
      data-flash={flashId === field.id}
      onPointerDown={select}
      onFocus={select}
      className={`eu-field relative scroll-mt-24 rounded-lg px-3 py-3 transition-colors ${className}`}
    >
      {selected && <FieldToolbar field={field} />}
      {children}
    </div>
  );
}

function Section({ field, state, depth }) {
  const repeating = field.type === "REPEATING_SECTION";
  const [copies, setCopies] = useState(1);
  const headingId = useId();
  const questions = childQuestions(field);
  const Heading = depth === 0 ? "h4" : "h5";
  return (
    <FieldFrame field={field} state={state} className="px-0 py-0">
      <section aria-labelledby={headingId} className={`rounded-lg border border-slate-200 bg-white ${depth === 0 ? "p-5 shadow-xs" : "p-4"}`}>
        <PreviewLabel field={field} headingId={headingId} Heading={Heading} />
        <Rich html={field.description} className="mt-1" />
        <Notes field={field} state={state} />
        {Array.from({ length: copies }, (_, copy) => (
          <div key={copy} className={copy > 0 ? "mt-4 border-t border-slate-200 pt-4" : "mt-3"}>
            {repeating && copies > 1 && (
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">Pozycja {copy + 1}</p>
                {copy > 0 && (
                  <button type="button" onClick={() => setCopies((value) => value - 1)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50">
                    <Trash2 aria-hidden="true" size={14} /> Usuń pozycję
                  </button>
                )}
              </div>
            )}
            <Questions questions={questions} depth={depth + 1} idSuffix={copy > 0 ? `~${copy}` : ""} />
          </div>
        ))}
        {repeating && (
          <button type="button" onClick={() => setCopies((value) => value + 1)} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md border-2 border-(--blue) px-3 text-sm font-semibold text-(--blue) hover:bg-(--blue-soft)">
            <Plus aria-hidden="true" size={16} /> Dodaj kolejną pozycję
          </button>
        )}
      </section>
    </FieldFrame>
  );
}

function PreviewLabel({ field, headingId, Heading }) {
  const { renamingId } = usePreview();
  if (renamingId === field.id) return <FieldToolbar.RenameInput field={field} />;
  return (
    <Heading id={headingId} className="text-lg font-bold text-slate-900">
      {field.title || <span className="font-normal text-slate-500 italic">Sekcja bez tytułu</span>}
    </Heading>
  );
}

export function Questions({ questions, depth = 0, idSuffix = "" }) {
  const { states, showHidden } = usePreview();
  return (
    <div className="eu-grid">
      {orderedIndexes(questions).map((index) => {
        const question = questions[index];
        const field = question?.field;
        if (!field) return null;
        const state = states[field.id];
        if (state && !state.visible && !showHidden) return null;
        const x = Math.max(0, Math.min(2, Number(question.x) || 0));
        const cols = Math.max(1, Math.min(3 - x, Number(question.cols) || 3));
        return (
          <div key={field.id ?? index} className="eu-cell" style={{ "--eu-col": `${x + 1} / span ${cols}` }}>
            {isContainerType(field.type) ? (
              <Section field={field} state={state} depth={depth} />
            ) : (
              <FieldFrame field={field} state={state}>
                <Control field={field} state={state} idSuffix={idSuffix} />
              </FieldFrame>
            )}
          </div>
        );
      })}
    </div>
  );
}
