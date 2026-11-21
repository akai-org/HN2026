// Zwarty pasek nad kolumnami: liczby o formularzu, lista uwag, reguły COI i (opcjonalnie) wybór kolumn.
// Listy rozwijają się pod paskiem, więc domyślnie kolumny dostają prawie cały ekran.
import { useId, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, CircleX, Info, ListChecks, TriangleAlert } from "lucide-react";
import { FORMS, plural } from "../lib/text.js";
import { Button } from "../components/primitives.jsx";

const LEVELS = {
  error: { icon: CircleAlert, tone: "text-red-700", label: "Błąd" },
  warning: { icon: TriangleAlert, tone: "text-amber-700", label: "Uwaga" },
  info: { icon: Info, tone: "text-(--blue)", label: "Wskazówka" },
};

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline gap-1">
      <dd className="text-lg font-bold text-slate-900 tabular-nums">{value}</dd>
      <dt className="text-sm text-slate-700">{label}</dt>
    </div>
  );
}

function Toggle({ open, controls, onClick, children }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 transition ${
        open ? "bg-(--blue-soft) text-(--blue) ring-(--blue-ring)" : "bg-slate-50 text-slate-800 ring-slate-200 hover:bg-slate-100"
      }`}
    >
      {children}
      <ChevronDown aria-hidden="true" size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

export default function ChecksPanel({ stats, checks, onShowField, children }) {
  // Lista otwiera się sama tylko przy błędach; przy samych uwagach zostaje zwinięta.
  const [open, setOpen] = useState(() => checks.issues.some((issue) => issue.level === "error"));
  const [rulesOpen, setRulesOpen] = useState(false);
  const listId = useId();
  const rulesId = useId();
  const { issues, rules } = checks;
  const blocking = issues.filter((issue) => issue.level !== "info");
  const errors = issues.filter((issue) => issue.level === "error").length;
  const passed = rules.filter((rule) => rule.passed).length;

  return (
    <section aria-label="Podsumowanie i uwagi" className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Stat value={stats.pages} label={plural(stats.pages, FORMS.page)} />
          <Stat value={stats.fields} label={plural(stats.fields, FORMS.field)} />
          <Stat value={stats.autoFilled} label="z rejestrów" />
          <Stat value={stats.conditional} label="z warunkiem" />
          <Stat value={stats.required} label={plural(stats.required, ["obowiązkowe", "obowiązkowe", "obowiązkowych"])} />
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle open={open} controls={listId} onClick={() => setOpen((value) => !value)}>
            {errors ? <CircleAlert aria-hidden="true" size={16} className="text-red-700" /> : <ListChecks aria-hidden="true" size={16} />}
            Do sprawdzenia
            <span className={`rounded-full px-1.5 text-xs font-bold ${blocking.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
              {blocking.length}
            </span>
          </Toggle>
          <Toggle open={rulesOpen} controls={rulesId} onClick={() => setRulesOpen((value) => !value)}>
            {passed === rules.length ? <CircleCheck aria-hidden="true" size={16} className="text-emerald-700" /> : <TriangleAlert aria-hidden="true" size={16} className="text-amber-700" />}
            Reguły COI {passed}/{rules.length}
          </Toggle>
        </div>
        {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
      </div>

      <div id={listId} hidden={!open} className="border-t border-slate-100">
        <h2 className="sr-only">Do sprawdzenia przed zatwierdzeniem</h2>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-800">
            <CircleCheck aria-hidden="true" size={16} /> Nie znaleźliśmy niczego do poprawy.
          </p>
        ) : (
          <ul className="kv-scroll max-h-48 divide-y divide-slate-100 overflow-y-auto">
            {issues.map((issue) => {
              const level = LEVELS[issue.level];
              const Icon = level.icon;
              return (
                <li key={issue.id} className="flex items-start gap-3 px-4 py-2">
                  <Icon aria-hidden="true" size={18} className={`mt-0.5 shrink-0 ${level.tone}`} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-slate-900">
                      <span className="sr-only">{level.label}: </span>
                      {issue.title}
                    </p>
                    {issue.detail && <p className="text-slate-700">{issue.detail}</p>}
                  </div>
                  {issue.fieldId && (
                    <Button size="sm" onClick={() => onShowField(issue.fieldId)}>
                      Pokaż pole
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ul id={rulesId} hidden={!rulesOpen} className="grid gap-x-6 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2">
            {rule.passed ? <CircleCheck aria-hidden="true" size={16} className="shrink-0 text-emerald-700" /> : <CircleX aria-hidden="true" size={16} className="shrink-0 text-red-700" />}
            <span className="sr-only">{rule.passed ? "Spełnione:" : "Do poprawy:"}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
