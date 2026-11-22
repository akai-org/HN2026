import { ChevronDown, Upload } from "@/components/icons";
import {
  SECTION_TYPES,
  VALIDATOR_LABELS,
  describeShowCondition,
  htmlParagraphs,
  isRequired,
} from "@/lib/formDefinition";
import { cn } from "@/lib/utils";
import Panel from "./Panel";

/**
 * Read-only picture of the e-form built from the FormDefinition: one page at a time, sections, fields on a
 * 3-column grid. Clicking a section or a field selects it; the JSON panel then highlights it.
 */
export default function FormPreview({ form, index, page, onPageChange, selectedId, onSelect }) {
  const tabs = form?.tabs || [];
  const tab = tabs[page];

  return (
    <Panel number={2} title="Formularz" subtitle="kliknij pole, aby zobaczyć jego JSON" bodyClassName="bg-muted/30">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <p className="truncate text-sm font-semibold" title={form?.title}>{form?.title || "Formularz bez tytułu"}</p>
        <div role="tablist" aria-label="Strony formularza" className="mt-2 flex gap-2 overflow-x-auto pb-1 pr-1">
          {tabs.map((item, tabIndex) => (
            <button
              key={item.id || tabIndex}
              type="button"
              role="tab"
              aria-selected={tabIndex === page}
              onClick={() => onPageChange(tabIndex)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tabIndex === page
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="tabular-nums">{tabIndex + 1}</span>
              <span className="max-w-40 truncate">{item.title || "Strona"}</span>
              {item.type === "FINISH" && <span className="text-[10px] uppercase">końcowa</span>}
            </button>
          ))}
        </div>
      </div>

      {!tab ? (
        <p className="p-6 text-sm text-muted-foreground">Formularz nie ma stron.</p>
      ) : (
        <div role="tabpanel" aria-label={tab.title} className="space-y-3 p-3">
          <h3 className="px-1 text-lg font-semibold">{tab.title}</h3>
          {(tab.questions || []).map((question, questionIndex) => (
            question?.field && (
              <Section
                key={question.field.id || questionIndex}
                section={question.field}
                titles={index.titles}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )
          ))}
        </div>
      )}
    </Panel>
  );
}

function selectable(id, onSelect) {
  return {
    role: "button",
    tabIndex: 0,
    "data-node-id": id,
    onClick: (event) => {
      event.stopPropagation();
      onSelect(id);
    },
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        onSelect(id);
      }
    },
  };
}

function Section({ section, titles, selectedId, onSelect }) {
  const items = [...(section.repeatingSectionGrid || [])]
    .filter((item) => item?.field)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const condition = describeShowCondition(section.states, titles);
  const description = htmlParagraphs(section.description);
  const isSelected = selectedId === section.id;

  return (
    <section
      aria-label={section.title || "Sekcja"}
      className={cn(
        "rounded-lg border bg-background p-3 shadow-xs",
        isSelected ? "border-amber-400 ring-2 ring-amber-300" : "border-border",
      )}
    >
      <div
        {...selectable(section.id, onSelect)}
        aria-pressed={isSelected}
        aria-label={`Sekcja ${section.title || "bez tytułu"}: pokaż JSON`}
        className="-m-1 mb-2 flex cursor-pointer flex-wrap items-center gap-2 rounded-md p-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <h4 className="font-semibold">{section.title || <span className="text-muted-foreground">Sekcja bez tytułu</span>}</h4>
        {section.type === "REPEATING_SECTION" && <Badge>sekcja powtarzalna</Badge>}
        {condition && <Badge tone="info" title={`Widoczna, gdy ${condition}`}>gdy {condition}</Badge>}
      </div>
      {description.map((text, i) => (
        <p key={i} className="mb-2 text-sm text-muted-foreground">{text}</p>
      ))}
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div
            key={item.field.id}
            style={{ gridColumn: `${(item.x ?? 0) + 1} / span ${Math.min(item.cols || 3, 3 - (item.x ?? 0))}` }}
            className="min-w-0"
          >
            <PreviewField field={item.field} titles={titles} selectedId={selectedId} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewField({ field, titles, selectedId, onSelect }) {
  const isSelected = selectedId === field.id;
  const condition = describeShowCondition(field.states, titles);
  const validators = (field.validation || []).filter((name) => name !== "REQUIRED");
  const isExternal = field.defaultValueType === "EXTERNAL_SYSTEM";
  const isText = field.type === "TEXT_BLOCK" || field.type === "INFO_SECTION";
  const description = isText ? [] : htmlParagraphs(field.description);

  return (
    <div
      {...selectable(field.id, onSelect)}
      aria-pressed={isSelected}
      aria-label={`${field.title || field.type}: pokaż JSON`}
      className={cn(
        "cursor-pointer rounded-md border p-2 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        isSelected ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300" : "border-transparent hover:border-border hover:bg-muted/40",
      )}
    >
      {!isText && field.type !== "CONSENT_SECTION" && (
        <p className="mb-1 text-sm font-medium">
          {field.title || <span className="text-muted-foreground">(bez etykiety)</span>}
          {isRequired(field) && <span className="ml-0.5 text-destructive" aria-label="wymagane">*</span>}
        </p>
      )}
      {description.map((text, i) => (
        <p key={i} className="mb-1 text-xs text-muted-foreground">{text}</p>
      ))}
      <Control field={field} />
      {(condition || validators.length > 0 || isExternal || field.readOnly || field.dictionaryName) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {field.dictionaryName && <Badge tone="dictionary">słownik: {field.dictionaryName}</Badge>}
          {isExternal && <Badge tone="external">dane z rejestru: {String(field.defaultValue)}</Badge>}
          {field.readOnly && <Badge>tylko do odczytu</Badge>}
          {validators.map((name) => (
            <Badge key={name} tone="validator">walidacja: {VALIDATOR_LABELS[name] || name}</Badge>
          ))}
          {condition && <Badge tone="info" title={`Widoczne, gdy ${condition}`}>gdy {condition}</Badge>}
        </div>
      )}
    </div>
  );
}

const INPUT_BOX = "flex min-h-9 items-center rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground";

function Control({ field }) {
  const options = field.options || [];
  const initial = field.defaultValueType === "EXTERNAL_SYSTEM" ? "" : displayValue(field.defaultValue);

  switch (field.type) {
    case "TEXT_FIELD":
    case "NUMBER":
      return <div className={INPUT_BOX}>{initial || (field.type === "NUMBER" ? "0" : "")}</div>;
    case "DATEPICKER":
      return <div className={INPUT_BOX}>{initial || "dd.mm.rrrr"}</div>;
    case "TEXTAREA":
      return <div className={cn(INPUT_BOX, "min-h-20 items-start py-2")}>{initial}</div>;
    case "SELECT":
      return (
        <div className={cn(INPUT_BOX, "justify-between gap-2")}>
          <span className="truncate">
            {initial || (field.dictionaryName ? `Wybierz (${field.dictionaryName})` : "Wybierz z listy")}
          </span>
          <ChevronDown size={16} className="shrink-0" />
          {options.length > 0 && <span className="sr-only">Opcje: {options.map((o) => o.name).join(", ")}</span>}
        </div>
      );
    case "RADIO":
    case "CHECKBOX":
      return (
        <ul className="space-y-1">
          {(options.length ? options : [{ id: field.techName, name: field.title }]).map((option) => (
            <li key={option.id ?? option.name} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0 border border-muted-foreground/60 bg-background",
                  field.type === "RADIO" ? "rounded-full" : "rounded-sm",
                )}
              />
              <span>{option.name}</span>
            </li>
          ))}
          {field.dictionaryName && !options.length && (
            <li className="text-xs text-muted-foreground">Opcje ze słownika {field.dictionaryName}</li>
          )}
        </ul>
      );
    case "FILE_UPLOADER":
      return (
        <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm text-muted-foreground">
          <Upload size={16} />
          Dodaj plik
        </div>
      );
    case "TEXT_BLOCK":
    case "INFO_SECTION":
      return (
        <div className={cn("space-y-1 text-sm", field.type === "INFO_SECTION" && "rounded-md bg-sky-50 p-2 text-sky-950")}>
          {field.title && <p className="font-medium">{field.title}</p>}
          {htmlParagraphs(field.description).map((text, i) => <p key={i}>{text}</p>)}
        </div>
      );
    case "CONSENT_SECTION": {
      const consents = field.consentSectionConfig?.consents || [];
      return (
        <ul className="space-y-1.5">
          {consents.map((consent, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 rounded-sm border border-muted-foreground/60 bg-background" />
              <span>
                {htmlParagraphs(consent.description).join(" ")}
                {consent.required && <span className="ml-0.5 text-destructive" aria-label="wymagana">*</span>}
              </span>
            </li>
          ))}
          {!consents.length && <li className="text-sm text-muted-foreground">Sekcja zgód bez zgód</li>}
        </ul>
      );
    }
    default:
      return SECTION_TYPES.has(field.type) ? null : (
        <div className={INPUT_BOX}>Typ pola: {field.type}</div>
      );
  }
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined || value === null ? "" : String(value);
}

const BADGE_TONES = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  dictionary: "border-violet-200 bg-violet-50 text-violet-900",
  external: "border-emerald-200 bg-emerald-50 text-emerald-900",
  validator: "border-amber-200 bg-amber-50 text-amber-900",
};

function Badge({ tone = "neutral", title, children }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 text-[11px] leading-tight", BADGE_TONES[tone])}>
      <span className="truncate">{children}</span>
    </span>
  );
}
