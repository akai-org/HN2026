// An "i" button with a tooltip (Base UI Tooltip, MIT, already a dependency). The tooltip shows on hover
// and on keyboard focus; the same text is the button's description for screen readers.
import { useId } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "@/components/icons";
import { cn } from "@/lib/utils";

export default function InfoTip({ label = "Informacja", side = "bottom", className, children }) {
  const descriptionId = useId();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        aria-describedby={descriptionId}
        delay={150}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring",
          className,
        )}
      >
        <Info size={18} />
      </Tooltip.Trigger>
      <span id={descriptionId} className="sr-only">
        {children}
      </span>
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={8} collisionPadding={12} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-lg">
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
