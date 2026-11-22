import { cn } from "@/lib/utils";

/** Horizontal rule with a label in the middle, in the current text color. Only spans, so it fits in a button. */
export default function Divider({ className, children }) {
  return (
    <span className={cn("flex w-full items-center gap-3 text-xs font-semibold", className)}>
      <span className="h-px flex-1 bg-current/40" />
      {children}
      <span className="h-px flex-1 bg-current/40" />
    </span>
  );
}
