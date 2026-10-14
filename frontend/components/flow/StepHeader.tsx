import type { CSSProperties, ReactNode } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/cn";
import { PROGRESS_STAGES } from "@/lib/session";

/**
 * Staggered entrance for `animate-fade-up` blocks. Fill mode "backwards" (not
 * the token's "both") so a finished animation leaves no transform behind:
 * a lingering identity transform would make each card a stacking context and
 * let later cards paint over an open airport dropdown.
 */
export function fadeUp(delayMs = 0): CSSProperties {
  return { animationDelay: `${delayMs}ms`, animationFillMode: "backwards" };
}

/** Slim, quiet progress indicator: four thin segments and "Step n of 4". Not gamified. */
export function ProgressBar({ stage, className }: { stage: number; className?: string }) {
  const total = PROGRESS_STAGES.length;
  const label = `Step ${stage} of ${total}: ${PROGRESS_STAGES[stage - 1]}`;
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={stage}
      aria-valuetext={label}
      aria-label="Study progress"
      className={cn("flex items-center gap-3", className)}
    >
      <div className="flex flex-1 gap-1.5">
        {PROGRESS_STAGES.map((name, i) => {
          const n = i + 1;
          return (
            <span
              key={name}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                n < stage ? "bg-night-900/35" : n === stage ? "bg-night-900" : "bg-line-strong",
              )}
            />
          );
        })}
      </div>
      <span className="text-[11px] font-semibold tracking-wide text-ink-400 tabular-nums">
        {stage} of {total}
      </span>
    </div>
  );
}

interface StepHeaderProps {
  /** Progress stage 1–4; omit for screens outside the numbered flow. */
  stage?: number | null;
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  className?: string;
}

/** Progress bar + eyebrow + title + one calm line of context. */
export function StepHeader({ stage, eyebrow, title, sub, className }: StepHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {stage ? <ProgressBar stage={stage} className="mb-7" /> : null}
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-calm-700">{eyebrow}</p>
      ) : null}
      <h1 className="mt-1.5 text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-ink-900">{title}</h1>
      {sub ? <p className="mt-2.5 text-[15px] leading-relaxed text-ink-500">{sub}</p> : null}
    </header>
  );
}

/** Small brand mark used on the welcome, loading and debrief screens. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-xl bg-night-900 text-white shadow-soft"
      >
        <Plane className="size-4" />
      </span>
      <span className="text-[15px] font-bold tracking-tight text-ink-900">Pre-Flight Clarity</span>
    </div>
  );
}
