import { Link, useLocation } from "react-router-dom";
import { FileText } from "@/components/icons";
import { cn } from "@/lib/utils";

const STEPS = [
  { path: "/", label: "Dodawanie formularza" },
  { path: "/digitalize", label: "Cyfryzowanie" },
  { path: "/verify", label: "Przejdź do przeglądu" },
];

export default function Header() {
  return (
    <header className="border-b bg-background px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-md border bg-muted/40 text-primary">
            <FileText size={24} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">UniForm</p>
            <p className="text-xs text-muted-foreground">cyfryzacja formularzy</p>
          </div>
        </div>
        <StepNav />
      </div>
    </header>
  );
}

function StepNav() {
  const location = useLocation();
  // Steps 2 and 3 work on the conversion results, which travel in the router state.
  const hasResults = Boolean(location.state?.convertedForms?.length);

  return (
    <nav aria-label="Postęp" className="flex items-center gap-4">
      {STEPS.map(({ path, label }, index) => {
        const isActive = location.pathname === path;
        const isReachable = index === 0 || hasResults;
        const content = (
          <>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs",
                isActive ? "bg-primary text-primary-foreground" : "border bg-muted/50",
              )}
            >
              {index + 1}
            </span>
            <span className="hidden md:inline">{label}</span>
          </>
        );

        if (isActive) {
          return (
            <span
              key={path}
              aria-current="step"
              className="flex items-center gap-2 border-b-2 border-primary pb-1 text-sm font-medium text-primary"
            >
              {content}
            </span>
          );
        }
        if (!isReachable) {
          return (
            <span
              key={path}
              aria-disabled="true"
              title="Najpierw dodaj i zcyfryzuj formularz"
              className="flex cursor-not-allowed items-center gap-2 pb-1 text-sm text-muted-foreground opacity-60"
            >
              {content}
            </span>
          );
        }
        return (
          <Link
            key={path}
            to={path}
            state={index === 0 ? undefined : location.state}
            className="flex items-center gap-2 rounded-sm pb-1 text-sm text-muted-foreground focus-ring hover:text-foreground"
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
