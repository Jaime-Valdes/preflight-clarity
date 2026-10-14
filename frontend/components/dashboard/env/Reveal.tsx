"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  open: boolean;
  /** Set when a control points at this panel with aria-controls. */
  id?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Height-animated disclosure (the grid-template-rows trick, same as
 * SectionCard). Content stays mounted; while closed it is inert so it can't be
 * tabbed into or read by assistive tech. Takes no vertical space when closed,
 * so put any spacing inside the children.
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
