import { useLocation } from "react-router-dom";
import { FileText } from "lucide-react";

export default function Header() {
  const { pathname } = useLocation();
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

  return (
    <header className="bg-background">
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
              <FileText aria-hidden="true" size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">UniForm</p>
              <p className="text-xs text-muted-foreground">Konwersja formularzy — e-formularze</p>
            </div>
          </div>
          <nav aria-label="Postęp" className="flex items-center gap-4">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const isActive = activeStep === step;

              return (
                <span
                  key={step}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 pb-1 text-sm ${
                    isActive
                      ? "border-b-2 border-primary font-medium text-primary"
                      : "text-muted-foreground"
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
                </span>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}