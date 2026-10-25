import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface MeterBarProps {
  label: string;
  /** 0–100 share of the track to fill. */
  value: number;
  /** Text shown at the right end; defaults to "82%". */
  display?: string;
  /** Small line under the track: a note, or a benchmark line setting the figure against its industry average. */
  hint?: ReactNode;
  tone?: "calm" | "breeze";
}

const TONES = {
  calm: { track: "bg-calm-100", fill: "bg-calm-500" },
  breeze: { track: "bg-breeze-100", fill: "bg-breeze-400" },
} as const;

/** Thin horizontal meter: the track is a lighter step of the fill's own ramp. */
export function MeterBar({ label, value, display, hint, tone = "breeze" }: MeterBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const t = TONES[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-ink-700">{label}</span>
        <span className="shrink-0 text-sm font-bold text-ink-900 tabular-nums">{display ?? `${pct}%`}</span>
      </div>
      <div className={cn("mt-1.5 h-2 w-full overflow-hidden rounded-full", t.track)} aria-hidden>
        <div className={cn("h-full rounded-full", t.fill)} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <div className="mt-1 text-xs leading-snug text-ink-500">{hint}</div> : null}
    </div>
  );
}
