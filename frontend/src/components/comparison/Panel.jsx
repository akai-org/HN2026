import { cn } from "@/lib/utils";

/** One column of the comparison view: numbered header with actions and a scrollable body of fixed height. */
export default function Panel({ number, title, subtitle, actions, bodyRef, bodyClassName, children }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm"
    >
      <header className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {number}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={subtitle}>
            {subtitle}
          </span>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1">{actions}</div>}
      </header>
      <div
        ref={bodyRef}
        className={cn("relative h-[70vh] min-h-96 overflow-auto lg:h-[calc(100vh-15rem)]", bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}

/** Small two-state toggle used in panel headers ("Plik" / "Odczytany tekst"). */
export function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
