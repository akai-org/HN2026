// Mały panel pod przyciskiem (ustawienia, objaśnienia). Zamyka się Escape i kliknięciem obok.
import { useEffect, useId, useRef, useState } from "react";

export default function Popover({ button, label, children, align = "right", width = "w-72", buttonClassName = "" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);

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
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={`absolute z-50 mt-2 ${width} rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-xl motion-safe:animate-[kv-pop-in_150ms_ease-out] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
