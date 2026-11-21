// Wspólne klocki interfejsu: przyciski, okno dialogowe, odznaki. Styl jak na stronie /makieta.
import { forwardRef, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { base, buttonClass, variants } from "./buttonClass.js";

export const Button = forwardRef(function Button({ variant, size, className, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size, className })} {...props} />;
});

/** Przycisk z samą ikoną: etykieta trafia do aria-label i dymka (title). Cel min. 36×36 px. */
export const IconButton = forwardRef(function IconButton(
  { label, icon: Icon, variant = "quiet", size = 18, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`${base} size-9 rounded-lg ${variants[variant]} ${className}`}
      {...props}
    >
      <Icon aria-hidden="true" size={size} />
    </button>
  );
});

const tones = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-(--blue-soft) text-(--blue) ring-(--blue-ring)",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ tone = "neutral", icon: Icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tones[tone]} ${className}`}>
      {Icon && <Icon aria-hidden="true" size={13} strokeWidth={2.25} className="shrink-0" />}
      {children}
    </span>
  );
}

/**
 * Natywne okno dialogowe (<dialog>): pułapka fokusu, Escape i powrót fokusu daje przeglądarka.
 * side="right" otwiera panel z boku (pomoc), domyślnie okno na środku.
 */
export function Modal({ open, onClose, title, description, children, footer, side, size = "md", initialFocusRef }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (initialFocusRef?.current) requestAnimationFrame(() => initialFocusRef.current?.focus());
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocusRef]);

  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  const placement =
    side === "right"
      ? `m-0 ml-auto h-dvh max-h-dvh w-full ${width} rounded-none open:motion-safe:animate-[kv-slide-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]`
      : `m-auto max-h-[min(92dvh,900px)] w-[calc(100%-2rem)] ${width} rounded-3xl open:motion-safe:animate-[kv-pop-in_180ms_ease-out]`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`kv-modal bg-white p-0 text-slate-900 shadow-2xl ${placement}`}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-bold text-slate-900">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-slate-600">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Zamknij" icon={X} onClick={onClose} className="-mr-2" />
          </div>
          <div className="kv-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Klawisz w tekście pomocy. */
export function Kbd({ children }) {
  return (
    <kbd className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-[inherit] text-[11px] font-semibold text-slate-700 shadow-[inset_0_-1px_0_var(--color-slate-300)]">
      {children}
    </kbd>
  );
}

/** Przełącznik (role="switch") z etykietą. */
export function Switch({ checked, onChange, label, description, id }) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <span className="inline-flex items-center gap-2.5">
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 transition ${
          checked ? "border-(--blue) bg-(--blue)" : "border-slate-400 bg-white"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-4 rounded-full shadow transition-transform ${checked ? "translate-x-4 bg-white" : "translate-x-0.5 bg-slate-500"}`}
        />
      </button>
      <label htmlFor={switchId} className="cursor-pointer text-sm font-medium text-slate-800">
        {label}
        {description && <span className="block text-xs font-normal text-slate-600">{description}</span>}
      </label>
    </span>
  );
}
