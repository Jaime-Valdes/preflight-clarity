import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatProps {
  label: string;
  value: ReactNode;
  /** Small line under the value, e.g. "on this aircraft type". */
  hint?: ReactNode;
  className?: string;
}

/** Label + big number tile. Use inside a grid, e.g. `grid grid-cols-2 gap-3`. */
export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn("rounded-2xl bg-canvas/70 px-3.5 py-3 ring-1 ring-inset ring-line/70", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-bold leading-tight text-ink-900 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs leading-snug text-ink-500">{hint}</div> : null}
    </div>
  );
}
