// Podsumowanie formularza i lista rzeczy do sprawdzenia przed zatwierdzeniem.
import { useId, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { FORMS, plural } from "../lib/text.js";
import { Button } from "../components/primitives.jsx";

const LEVELS = {
  error: { icon: CircleAlert, tone: "text-red-700", label: "Błąd" },
  warning: { icon: TriangleAlert, tone: "text-amber-700", label: "Uwaga" },
  info: { icon: Info, tone: "text-(--blue)", label: "Wskazówka" },
};

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="text-2xl font-bold text-slate-900 tabular-nums">{value}</dd>
      <dt className="text-sm text-slate-700">{label}</dt>
    </div>
  );
}

export default function ChecksPanel({ stats, checks, onShowField }) {
  // Lista otwiera się sama, gdy są błędy; przy samych uwagach zostaje zwinięta, żeby kolumny były wyżej.
  const [open, setOpen] = useState(() => checks.issues.some((issue) => issue.level === "error"));
  const [rulesOpen, setRulesOpen] = useState(false);
  const listId = useId();
  const rulesId = useId();
  const { issues, rules } = checks;
  const blocking = issues.filter((issue) => issue.level !== "info");
  const passed = rules.filter((rule) => rule.passed).length;

  return (
    <section aria-labelledby={`${listId}-title`} className="rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat value={stats.pages} label={plural(stats.pages, FORMS.page)} />
          <Stat value={stats.fields} label={plural(stats.fields, FORMS.field)} />
          <Stat value={stats.autoFilled} label="z rejestrów" />
          <Stat value={stats.conditional} label="z warunkiem" />
          <Stat value={stats.required} label={plural(stats.required, ["obowiązkowe", "obowiązkowe", "obowiązkowych"])} />
        </dl>
        <button
          type="button"
          aria-expanded={rulesOpen}
          aria-controls={rulesId}
          onClick={() => setRulesOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
        >
          {passed === rules.length ? <CircleCheck aria-hidden="true" size={16} className="text-emerald-700" /> : <TriangleAlert aria-hidden="true" size={16} className="text-amber-700" />}
          Spełnia {passed} z {rules.length} reguł COI
          <ChevronDown aria-hidden="true" size={16} className={`transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      <ul id={rulesId} hidden={!rulesOpen} className="grid gap-x-6 gap-y-1.5 border-t border-slate-100 px-5 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2">
            {rule.passed ? <CircleCheck aria-hidden="true" size={16} className="shrink-0 text-emerald-700" /> : <CircleX aria-hidden="true" size={16} className="shrink-0 text-red-700" />}
            <span className="sr-only">{rule.passed ? "Spełnione:" : "Do poprawy:"}</span>
            {rule.label}
          </li>
        ))}
      </ul>

      <div className="border-t border-slate-100">
        <h2 id={`${listId}-title`}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-5 py-3 text-left font-bold text-slate-900 hover:bg-slate-50"
          >
            Do sprawdzenia przed zatwierdzeniem
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${blocking.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
              {blocking.length}
            </span>
            <ChevronDown aria-hidden="true" size={18} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </h2>
        <div id={listId} hidden={!open}>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 px-5 pb-4 text-sm text-emerald-800">
              <CircleCheck aria-hidden="true" size={16} /> Nie znaleźliśmy niczego do poprawy.
            </p>
          ) : (
            <ul className="kv-scroll max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {issues.map((issue) => {
                const level = LEVELS[issue.level];
                const Icon = level.icon;
                return (
                  <li key={issue.id} className="flex items-start gap-3 px-5 py-2.5">
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
      </div>
    </section>
  );
}
