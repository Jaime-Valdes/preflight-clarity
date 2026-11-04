import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

interface ProgressDashesProps {
  total: number;
  /** 0-based. */
  active: number;
  /** Read out instead of "Step n of total". */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Short rounded dashes for a step in a short flow: the active one ink, the rest slate. */
export function ProgressDashes({ total, active, label, className, style }: ProgressDashesProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} style={style} role="img" aria-label={label ?? `Step ${active + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.5 rounded-full", i === active ? "w-8 bg-ink" : "w-4 bg-slate")} />
      ))}
    </div>
  );
}
