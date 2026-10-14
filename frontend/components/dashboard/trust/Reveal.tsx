import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  open: boolean;
  /** Id referenced by the toggling button's aria-controls. */
  id?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Animated tap-to-reveal region (the same grid-rows trick as SectionCard).
 * Content stays mounted so closing animates; it is inert while hidden.
 */
export function Reveal({ open, id, children, className }: RevealProps) {
  return (
    <div
      id={id}
      className={cn("grid transition-[grid-template-rows] duration-300 ease-out", className)}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}
