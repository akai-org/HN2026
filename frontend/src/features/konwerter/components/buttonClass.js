// Klasy przycisków (osobny plik, żeby komponenty mogły ich używać także na linkach).

export const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0";

export const variants = {
  primary: "bg-(--blue) text-white shadow-sm shadow-blue-900/20 hover:bg-(--blue-hover)",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-xs hover:border-slate-400 hover:bg-slate-50",
  soft: "bg-(--blue-soft) text-(--blue) hover:bg-(--blue-ring)/70",
  quiet: "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
  danger: "text-red-700 hover:bg-red-50 hover:text-red-800",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
};

export function buttonClass({ variant = "secondary", size = "md", className = "" } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

