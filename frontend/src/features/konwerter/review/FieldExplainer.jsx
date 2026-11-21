// „Co oznacza ten fragment JSON-a”: opis zaznaczonego pola zwykłym językiem.
import { ChevronDown } from "lucide-react";
import { describeQuery } from "../lib/conditions.js";
import { asArray, isAutoFilled, isRequired, typeLabel, validatorNames } from "../lib/formModel.js";
import { dictionaryInfo, registrySourceLabel } from "../lib/registry.js";

function Row({ term, children, code }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-2 py-1">
      <dt className="text-slate-600">{term}</dt>
      <dd className="min-w-0 text-slate-900">
        {children}
        {code && (
          <code className="ml-1.5 rounded bg-slate-100 px-1 py-px font-mono text-[11px] break-all text-slate-700">{code}</code>
        )}
      </dd>
    </div>
  );
}

export default function FieldExplainer({ entry, titles, state, id, open, onToggle }) {
  if (!entry) {
    return null;
  }
  const { field, question } = entry;
  const conditions = asArray(field.states).filter((s) => typeof s?.query === "string");
  const dictionary = dictionaryInfo(field.dictionaryName);
  const validators = validatorNames(field).filter((name) => name !== "REQUIRED");
  const options = asArray(field.options);

  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
      className="group shrink-0 border-b border-slate-200 bg-(--blue-soft)/50"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-slate-900">Zaznaczone:</span>
        <span className="min-w-0 flex-1 truncate">
          {field.title || field.techName || "bez nazwy"}
          <span className="text-slate-600"> · {typeLabel(field.type)}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-(--blue)">{open ? "Zwiń opis" : "Co to znaczy?"}</span>
        <ChevronDown aria-hidden="true" size={16} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <dl className="kv-scroll max-h-44 overflow-y-auto px-3 pb-2 text-[13px]">
        <Row term="Rodzaj" code={field.type}>
          {typeLabel(field.type)}
        </Row>
        {field.techName && (
          <Row term="Nazwa techniczna" code={field.techName}>
            unikalna, po niej działają warunki
          </Row>
        )}
        {question && (
          <Row term="Położenie" code={`x:${question.x} y:${question.y} cols:${question.cols}`}>
            wiersz {Number(question.y ?? 0) + 1}, szerokość {question.cols ?? 3} z 3 kolumn
          </Row>
        )}
        <Row term="Obowiązkowe" code={isRequired(field) ? "REQUIRED" : undefined}>
          {isRequired(field) ? "tak" : "nie"}
        </Row>
        {validators.length > 0 && <Row term="Walidacja" code={validators.join(", ")}>sprawdzanie formatu</Row>}
        {isAutoFilled(field) && (
          <Row term="Dane z rejestru" code={field.defaultValue}>
            uzupełni się z {registrySourceLabel(field.defaultValue)}
          </Row>
        )}
        {!isAutoFilled(field) && field.defaultValue !== undefined && field.defaultValue !== "" && !(Array.isArray(field.defaultValue) && field.defaultValue.length === 0) && (
          <Row term="Domyślnie" code={JSON.stringify(field.defaultValue)}>
            wartość wstawiona na start
          </Row>
        )}
        {dictionary && (
          <Row term="Słownik" code={field.dictionaryName}>
            {dictionary.unknown ? "spoza listy słowników COI" : dictionary.label}
            {field.multiLevelTree ? ", wybór poziom po poziomie" : ""}
            {field.searchEnabled ? ", z wyszukiwaniem" : ""}
          </Row>
        )}
        {options.length > 0 && (
          <Row term="Opcje">
            {options
              .slice(0, 6)
              .map((option) => option?.name)
              .join(", ")}
            {options.length > 6 ? ` i ${options.length - 6} więcej` : ""}
          </Row>
        )}
        {conditions.map((condition, index) => (
          <Row key={index} term={condition.type === "SHOW" ? "Pokazuje się, gdy" : condition.type}>
            {describeQuery(condition.query, titles) ?? "warunek w języku JSONata"}
            {state && condition.type === "SHOW" && (
              <span className={`ml-1.5 font-semibold ${state.ownVisible ? "text-emerald-800" : "text-slate-600"}`}>
                ({state.ownVisible ? "teraz spełniony" : "teraz niespełniony"})
              </span>
            )}
          </Row>
        ))}
        {field.readOnly && <Row term="Edycja" code="readOnly: true">tylko do odczytu</Row>}
      </dl>
    </details>
  );
}
