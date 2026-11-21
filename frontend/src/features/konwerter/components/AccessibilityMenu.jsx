// Ustawienia dostępności: większy tekst, wysoki kontrast, mniej animacji, podkreślone linki.
// Zapisywane w localStorage i nakładane jako klasy na <html>, więc działają na całej stronie.
import { useEffect, useId, useRef, useState } from "react";
import { Accessibility, Check } from "lucide-react";
import { Switch } from "./primitives.jsx";
import { DEFAULT_SETTINGS } from "./useAccessibilitySettings.js";

const TEXT_SIZES = [
  { value: "normal", label: "A", description: "Standardowy tekst" },
  { value: "lg", label: "A+", description: "Większy tekst" },
  { value: "xl", label: "A++", description: "Największy tekst" },
];

export default function AccessibilityMenu({ settings, onChange }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const update = (patch) => onChange({ ...settings, ...patch });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
      >
        <Accessibility aria-hidden="true" size={18} />
        <span className="sr-only sm:not-sr-only">Dostępność</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Ustawienia dostępności"
          className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl motion-safe:animate-[kv-pop-in_150ms_ease-out]"
        >
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">Wielkość tekstu</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TEXT_SIZES.map((size) => {
                const active = settings.text === size.value;
                return (
                  <button
                    key={size.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ text: size.value })}
                    className={`relative flex h-11 items-center justify-center rounded-xl border-2 font-bold transition ${
                      active ? "border-(--blue) bg-(--blue-soft) text-(--blue)" : "border-slate-200 text-slate-800 hover:border-slate-400"
                    }`}
                  >
                    <span className={size.value === "normal" ? "text-sm" : size.value === "lg" ? "text-base" : "text-lg"}>{size.label}</span>
                    <span className="sr-only">: {size.description}</span>
                    {active && <Check aria-hidden="true" size={14} className="absolute top-1 right-1" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-4 space-y-3">
            <Switch checked={settings.contrast} onChange={(value) => update({ contrast: value })} label="Wysoki kontrast" />
            <Switch checked={settings.motion} onChange={(value) => update({ motion: value })} label="Ogranicz animacje" />
            <Switch checked={settings.underline} onChange={(value) => update({ underline: value })} label="Podkreślaj linki" />
          </div>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_SETTINGS)}
            className="mt-4 text-sm font-semibold text-(--blue) underline-offset-2 hover:underline"
          >
            Przywróć domyślne
          </button>
        </div>
      )}
    </div>
  );
}
