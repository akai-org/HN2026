import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Accessibility, Eye, FileText, Minus, Plus, RotateCcw, X } from "@/components/icons";

const STORAGE_KEY = "uniform-accessibility";
const STEP_PATHS = ["/", "/digitalize", "/verify"];
const DEFAULT_SETTINGS = {
  fontSize: "normal",
  highContrast: false,
  wideSpacing: false,
};

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Header() {
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
  const [settings, setSettings] = useState(readSettings);
  const location = useLocation();
  const { pathname } = location;
  const hasResults = Boolean(location.state?.convertedForms?.length);
  const activeStep =
    pathname === "/" ? 1 :
    pathname === "/digitalize" ? 2 :
    pathname === "/verify" ? 3 :
    null;
  const stepLabels = [
    "Dodawanie formularza",
    "Cyfryzowanie",
    "Sprawdź i zatwierdź",
  ];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      "a11y-font-smaller",
      "a11y-font-larger",
      "a11y-high-contrast",
      "a11y-wide-spacing",
    );

    if (settings.fontSize === "smaller") root.classList.add("a11y-font-smaller");
    if (settings.fontSize === "larger") root.classList.add("a11y-font-larger");
    if (settings.highContrast) root.classList.add("a11y-high-contrast");
    if (settings.wideSpacing) root.classList.add("a11y-wide-spacing");

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") setIsAccessibilityOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  function updateSetting(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  return (
    <header className="relative bg-background">
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
              <FileText aria-hidden="true" size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">UniForm</p>
              <p className="text-xs text-muted-foreground">cyfryzacja formularzy</p>
            </div>
          </div>
          <nav aria-label="Postęp" className="flex items-center gap-4">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const isActive = activeStep === step;
              // Steps 2 and 3 need the conversion results, which travel in the router state.
              const isReachable = step === 1 || hasResults;
              const StepTag = isReachable ? Link : "span";
              const linkProps = isReachable
                ? { to: STEP_PATHS[index], state: step === 1 ? undefined : location.state }
                : { "aria-disabled": true, title: "Najpierw dodaj i zcyfryzuj formularz" };

              return (
                <StepTag
                  key={step}
                  {...linkProps}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 pb-1 text-sm ${
                    isActive
                      ? "border-b-2 border-primary font-medium text-primary"
                      : "text-muted-foreground"
                  } ${isReachable && !isActive ? "rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" : ""} ${
                    isReachable ? "" : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/50"
                    }`}
                  >
                    {step}
                  </span>
                  <span className="hidden md:inline">{label}</span>
                </StepTag>
              );
            })}
          </nav>
        </div>
      </div>

      <button
        type="button"
        className="fixed bottom-5 right-5 z-50 inline-flex size-14 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Otwórz ustawienia dostępności"
        aria-expanded={isAccessibilityOpen}
        aria-controls="accessibility-panel"
        title="Dostępność"
        onClick={() => setIsAccessibilityOpen((open) => !open)}
      >
        <Accessibility aria-hidden="true" size={32} />
      </button>

      {isAccessibilityOpen && (
        <aside
          id="accessibility-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="accessibility-title"
          className="fixed bottom-20 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-background p-4 text-foreground shadow-xl sm:right-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p id="accessibility-title" className="text-lg font-semibold">
                Dostępność
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dostosuj widok do swoich potrzeb
              </p>
            </div>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Zamknij ustawienia dostępności"
              onClick={() => setIsAccessibilityOpen(false)}
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>

          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-semibold">Rozmiar tekstu</legend>
            <div className="grid grid-cols-3 gap-2" aria-label="Rozmiar tekstu">
              <button
                type="button"
                aria-pressed={settings.fontSize === "smaller"}
                onClick={() => updateSetting("fontSize", "smaller")}
                className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  settings.fontSize === "smaller" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                <Minus aria-hidden="true" size={16} />
                Mniejszy
              </button>
              <button
                type="button"
                aria-pressed={settings.fontSize === "normal"}
                onClick={() => updateSetting("fontSize", "normal")}
                className={`min-h-11 rounded-lg border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  settings.fontSize === "normal" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                aria-pressed={settings.fontSize === "larger"}
                onClick={() => updateSetting("fontSize", "larger")}
                className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  settings.fontSize === "larger" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                <Plus aria-hidden="true" size={16} />
                Większy
              </button>
            </div>
          </fieldset>

          <div className="grid gap-2">
            {[
              { key: "highContrast", label: "Wysoki kontrast", icon: Eye },
              { key: "wideSpacing", label: "Szeroki odstęp tekstu", icon: Plus },
            ].map(({ key, label, icon: Icon }) => (
              <button
                type="button"
                key={key}
                role="switch"
                aria-checked={settings[key]}
                onClick={() => updateSetting(key, !settings[key])}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  settings[key] ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"
                }`}
              >
                <Icon aria-hidden="true" size={19} className="shrink-0" />
                <span className="flex-1">{label}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    settings[key] ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                >
                  <span
                    className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${
                      settings[key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSettings(DEFAULT_SETTINGS)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <RotateCcw aria-hidden="true" size={17} />
            Przywróć ustawienia domyślne
          </button>
        </aside>
      )}
    </header>
  );
}