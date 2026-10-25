import type { ReactNode } from "react";
import { COLORS, type Tone } from "@/lib/theme";
import { cn } from "@/lib/cn";

/*
 * Version C: compact smoothness score — a small ring with the number, and
 * optionally the label next to it (and a quiet detail line under the label).
 * The ring takes the score's tone on the calm scale (scoreTone): sea-glass
 * teal for "Very smooth", sky blue for "Mostly smooth", soft sand for "Some
 * bumps expected" — the generator's own label thresholds. Never red: a lower
 * score is a fact, not an alarm.
 */

/** The calm tone for a score, matching the generator's label thresholds (fakeFlight.ts). */
export function scoreTone(score: number): Extract<Tone, "calm" | "breeze" | "sand"> {
  return score >= 88 ? "calm" : score >= 75 ? "breeze" : "sand";
}

/** Ring colours per tone (raw values, for the SVG). */
const RING: Record<ReturnType<typeof scoreTone>, { track: string; stroke: string }> = {
  calm: { track: COLORS.calm100, stroke: COLORS.calm500 },
  breeze: { track: COLORS.breeze100, stroke: COLORS.breeze500 },
  sand: { track: COLORS.sand100, stroke: COLORS.sand400 },
};

/** Tinted surface classes per tone, for a block that carries the score (result cards, the score sheet). */
export const SCORE_SURFACE: Record<ReturnType<typeof scoreTone>, string> = {
  calm: "bg-calm-50 ring-calm-100",
  breeze: "bg-breeze-50 ring-breeze-100",
  sand: "bg-sand-50 ring-sand-100",
};

interface ScoreBadgeProps {
  score: number;
  /** "Very smooth" | "Mostly smooth" | "Some bumps expected" */
  label?: string;
  /** A quiet line under the label, e.g. "1 bumpy stretch · 5 min". Read by screen readers as written. */
  detail?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: 36, md: 48, lg: 64 } as const;

export function ScoreBadge({ score, label, detail, size = "md", className }: ScoreBadgeProps) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const px = SIZES[size];
  const stroke = size === "sm" ? 3.5 : 4.5;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ring = RING[scoreTone(value)];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-grid shrink-0 place-items-center" style={{ width: px, height: px }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden className="-rotate-90">
          <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke={ring.track} strokeWidth={stroke} />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={ring.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * value) / 100} ${c}`}
          />
        </svg>
        <span
          aria-hidden
          className={cn(
            "absolute font-bold tabular-nums text-ink-900",
            size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-lg",
          )}
        >
          {value}
        </span>
      </span>
      <span className="sr-only">Smoothness score {value} out of 100{label ? `, ${label}` : ""}</span>
      {/* Without a detail line the label stays the root's last child (callers style it with [&>span:last-child]). */}
      {detail ? (
        <span className="flex min-w-0 flex-col">
          {label ? (
            <span aria-hidden className="text-sm font-semibold leading-tight text-ink-700">
              {label}
            </span>
          ) : null}
          <span className="mt-0.5 text-[11px] leading-snug text-ink-500">{detail}</span>
        </span>
      ) : label ? (
        <span aria-hidden className="text-sm font-semibold leading-tight text-ink-700">
          {label}
        </span>
      ) : null}
    </span>
  );
}
