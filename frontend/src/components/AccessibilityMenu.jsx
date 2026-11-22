import { useEffect, useState } from "react";
import { Accessibility, Eye, Minus, Plus, RotateCcw, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { localStore } from "@/lib/storage";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "uniform-accessibility";
const DEFAULT_SETTINGS = { fontSize: "normal", highContrast: false, wideSpacing: false };

const FONT_SIZES = [
  { value: "smaller", label: "Mniejszy", icon: Minus },
  { value: "normal", label: "Standard" },
  { value: "larger", label: "Większy", icon: Plus },
];

const SWITCHES = [
  { key: "highContrast", label: "Wysoki kontrast", icon: Eye },
  { key: "wideSpacing", label: "Szeroki odstęp tekstu", icon: Plus },
];

/** Floating button with a panel of display settings; they apply to the whole page and are remembered. */
export default function AccessibilityMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...localStore.read(STORAGE_KEY, {}),
  }));

  useEffect(() => {
    const classes = document.documentElement.classList;
    classes.toggle("a11y-font-smaller", settings.fontSize === "smaller");
    classes.toggle("a11y-font-larger", settings.fontSize === "larger");
    classes.toggle("a11y-high-contrast", settings.highContrast);
    classes.toggle("a11y-wide-spacing", settings.wideSpacing);
    localStore.write(STORAGE_KEY, settings);
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function update(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  return (
    <>
      <button
        type="button"
        aria-label="Otwórz ustawienia dostępności"
        aria-expanded={isOpen}
        aria-controls="accessibility-panel"
        title="Dostępność"
        onClick={() => setIsOpen((open) => !open)}
        className="fixed right-5 bottom-5 z-50 inline-flex size-14 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg focus-ring transition-colors hover:bg-primary/90"
      >
        <Accessibility size={32} />
      </button>

      {isOpen && (
        <aside
          id="accessibility-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="accessibility-title"
          className="fixed right-4 bottom-20 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border bg-background p-4 text-foreground shadow-xl sm:right-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="accessibility-title" className="text-lg font-semibold">
                Dostępność
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Dostosuj widok do swoich potrzeb</p>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Zamknij ustawienia dostępności"
              onClick={() => setIsOpen(false)}
            >
              <X size={20} />
            </Button>
          </div>

          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-semibold">Rozmiar tekstu</legend>
            <div className="grid grid-cols-3 gap-2">
              {FONT_SIZES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.fontSize === value}
                  onClick={() => update("fontSize", value)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-medium focus-ring",
                    settings.fontSize === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {Icon && <Icon size={16} />}
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            {SWITCHES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={settings[key]}
                onClick={() => update(key, !settings[key])}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-medium focus-ring",
                  settings[key] ? "border-primary bg-primary/10" : "bg-background hover:bg-muted",
                )}
              >
                <Icon size={19} className="shrink-0" />
                <span className="flex-1">{label}</span>
                <span
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    settings[key] ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 size-4 rounded-full bg-white transition-transform",
                      settings[key] ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </span>
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            className="mt-4 h-11 w-full font-semibold"
            onClick={() => setSettings(DEFAULT_SETTINGS)}
          >
            <RotateCcw size={17} />
            Przywróć ustawienia domyślne
          </Button>
        </aside>
      )}
    </>
  );
}
